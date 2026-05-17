const cron = require('node-cron');

const db = require('./db');
const {
  getVideoAnalytics,
  getVideoGeoAnalytics,
  getVideoSearchAnalytics
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

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getRelativeDate(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date;
}

async function buildSnapshotPayload(video, startDate, endDate) {
  const analytics = await getVideoAnalytics(
    video.youtube_id,
    startDate,
    endDate
  );
  const geo = await getVideoGeoAnalytics(
    video.youtube_id,
    startDate,
    endDate
  );
  const search = await getVideoSearchAnalytics(
    video.youtube_id,
    startDate,
    endDate
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
  const queryStartDate = formatDate(getRelativeDate(-3));
  const queryEndDate = formatDate(getRelativeDate(-2));
  const snapshotDate = formatDate(new Date());
  const payload = await buildSnapshotPayload(video, queryStartDate, queryEndDate);

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

  const optimization = selectLatestOptimizationForVideo.get(videoId);
  const endDate = getRelativeDate(-2);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 29);
  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);
  const payload = await buildSnapshotPayload(
    video,
    formattedStartDate,
    formattedEndDate
  );

  const result = insertSnapshot.run({
    video_id: videoId,
    optimization_id: optimization?.id || null,
    snapshot_date: formatDate(new Date()),
    ...payload
  });

  return selectSnapshotById.get(result.lastInsertRowid);
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
  runDailyMonitoring,
  takeBaselineSnapshot,
  takeSnapshot
};
