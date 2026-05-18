const cron = require('node-cron');

const db = require('./db');
const { getPacificDateString } = require('./time');
const {
  getVideoLifetimeAnalytics,
  getVideoLifetimeGeoAnalytics,
  getVideoLifetimeSearchAnalytics
} = require('./analytics');

const selectVideoById = db.prepare('SELECT * FROM videos WHERE id = ?');
const selectLatestOptimizationForVideo = db.prepare(`
  SELECT *
  FROM optimizations
  WHERE video_id = ?
  ORDER BY id DESC
  LIMIT 1
`);
const selectAppliedOptimizations = db.prepare(`
  SELECT *
  FROM optimizations
  WHERE status = 'applied'
  ORDER BY id ASC
`);
const selectSnapshotForToday = db.prepare(`
  SELECT id
  FROM monitoring_snapshots
  WHERE video_id = ? AND optimization_id = ? AND snapshot_date = ?
  LIMIT 1
`);
const insertSnapshot = db.prepare(`
  INSERT INTO monitoring_snapshots (
    video_id,
    optimization_id,
    snapshot_date,
    views,
    watch_time_minutes,
    search_views,
    search_watch_time,
    views_us,
    views_gb,
    views_ca,
    views_au,
    views_nz,
    avg_view_duration,
    avg_view_percentage,
    watch_time_us,
    watch_time_gb,
    watch_time_ca,
    watch_time_au,
    watch_time_nz
  ) VALUES (
    @video_id,
    @optimization_id,
    @snapshot_date,
    @views,
    @watch_time_minutes,
    @search_views,
    @search_watch_time,
    @views_us,
    @views_gb,
    @views_ca,
    @views_au,
    @views_nz,
    @avg_view_duration,
    @avg_view_percentage,
    @watch_time_us,
    @watch_time_gb,
    @watch_time_ca,
    @watch_time_au,
    @watch_time_nz
  )
`);
const selectSnapshotById = db.prepare(`
  SELECT *
  FROM monitoring_snapshots
  WHERE id = ?
`);
const insertBaselineSnapshot = db.prepare(`
  INSERT INTO baseline_snapshots (
    video_id,
    youtube_id,
    captured_at,
    views,
    watch_time_minutes,
    avg_view_duration,
    avg_view_percentage,
    search_views,
    search_watch_time,
    views_us,
    views_gb,
    views_ca,
    views_au,
    views_nz,
    watch_time_us,
    watch_time_gb,
    watch_time_ca,
    watch_time_au,
    watch_time_nz
  ) VALUES (
    @video_id,
    @youtube_id,
    @captured_at,
    @views,
    @watch_time_minutes,
    @avg_view_duration,
    @avg_view_percentage,
    @search_views,
    @search_watch_time,
    @views_us,
    @views_gb,
    @views_ca,
    @views_au,
    @views_nz,
    @watch_time_us,
    @watch_time_gb,
    @watch_time_ca,
    @watch_time_au,
    @watch_time_nz
  )
`);
const selectBaselineById = db.prepare(`
  SELECT *
  FROM baseline_snapshots
  WHERE id = ?
`);
const selectLatestBaselineForVideo = db.prepare(`
  SELECT *
  FROM baseline_snapshots
  WHERE video_id = ?
  ORDER BY captured_at DESC, id DESC
  LIMIT 1
`);
const selectLatestSnapshotForVideo = db.prepare(`
  SELECT *
  FROM monitoring_snapshots
  WHERE video_id = ?
  ORDER BY snapshot_date DESC, id DESC
  LIMIT 1
`);

const DELTA_FIELDS = [
  'views',
  'watch_time_minutes',
  'avg_view_duration',
  'avg_view_percentage',
  'search_views',
  'search_watch_time',
  'views_us',
  'views_gb',
  'views_ca',
  'views_au',
  'views_nz',
  'watch_time_us',
  'watch_time_gb',
  'watch_time_ca',
  'watch_time_au',
  'watch_time_nz'
];

function formatDate(date) {
  return getPacificDateString(date);
}

async function buildLifetimePayload(video) {
  const analytics = await getVideoLifetimeAnalytics(
    video.youtube_id,
    video.published_at
  );
  const geo = await getVideoLifetimeGeoAnalytics(
    video.youtube_id,
    video.published_at
  );
  const search = await getVideoLifetimeSearchAnalytics(
    video.youtube_id,
    video.published_at
  );

  return {
    ...analytics,
    ...geo,
    ...search
  };
}

async function takeSnapshot(videoId, optimizationId) {
  const video = selectVideoById.get(videoId);

  if (!video) {
    throw new Error('Video not found.');
  }

  const optimization =
    optimizationId != null
      ? { id: optimizationId }
      : selectLatestOptimizationForVideo.get(videoId);
  const snapshotDate = formatDate(new Date());
  const payload = await buildLifetimePayload(video);

  const result = insertSnapshot.run({
    video_id: videoId,
    optimization_id: optimization?.id || null,
    snapshot_date: snapshotDate,
    ...payload
  });

  return selectSnapshotById.get(result.lastInsertRowid);
}

async function takeBaselineSnapshot(videoId) {
  const video = selectVideoById.get(videoId);

  if (!video) {
    throw new Error('Video not found.');
  }

  const payload = await buildLifetimePayload(video);
  const result = insertBaselineSnapshot.run({
    video_id: videoId,
    youtube_id: video.youtube_id,
    captured_at: new Date().toISOString(),
    ...payload
  });

  return selectBaselineById.get(result.lastInsertRowid);
}

function getSnapshotDelta(videoId) {
  const baseline = selectLatestBaselineForVideo.get(videoId);
  const snapshot = selectLatestSnapshotForVideo.get(videoId);

  if (!baseline || !snapshot) {
    return null;
  }

  const delta = {
    baseline_snapshot: baseline,
    latest_snapshot: snapshot
  };

  for (const field of DELTA_FIELDS) {
    const baselineValue = Number(baseline[field] || 0);
    const snapshotValue = Number(snapshot[field] || 0);
    delta[field] = snapshotValue - baselineValue;
  }

  return delta;
}

async function runDailyMonitoring() {
  const optimizations = selectAppliedOptimizations.all();
  const today = formatDate(new Date());
  let snapshotsTaken = 0;

  for (const optimization of optimizations) {
    const existingSnapshot = selectSnapshotForToday.get(
      optimization.video_id,
      optimization.id,
      today
    );

    if (existingSnapshot) {
      continue;
    }

    console.log(
      `Taking monitoring snapshot for video ${optimization.video_id} (optimization ${optimization.id})`
    );
    await takeSnapshot(optimization.video_id, optimization.id);
    snapshotsTaken += 1;
  }

  console.log(`Daily monitoring complete. Snapshots taken: ${snapshotsTaken}`);

  return { snapshots_taken: snapshotsTaken };
}

cron.schedule('0 8 * * *', async () => {
  try {
    await runDailyMonitoring();
  } catch (error) {
    console.error('Daily monitoring job failed:', error);
  }
});

module.exports = {
  getSnapshotDelta,
  runDailyMonitoring,
  takeBaselineSnapshot,
  takeSnapshot
};
