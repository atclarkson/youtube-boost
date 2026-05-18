const express = require('express');

const db = require('../db');
const { getSnapshotDelta, takeSnapshot } = require('../monitor');
const { toDate } = require('../time');

const router = express.Router();

const selectVideoById = db.prepare('SELECT * FROM videos WHERE id = ?');
const selectLatestOptimizationForVideo = db.prepare(`
  SELECT *
  FROM optimizations
  WHERE video_id = ?
  ORDER BY id DESC
  LIMIT 1
`);
const selectSnapshotsForVideo = db.prepare(`
  SELECT *
  FROM monitoring_snapshots
  WHERE video_id = ?
  ORDER BY snapshot_date ASC, id ASC
`);
const selectMonitoringSummaryRows = db.prepare(`
  SELECT
    videos.*,
    optimizations.id AS optimization_id,
    optimizations.status AS optimization_status,
    optimizations.applied_at,
    optimizations.chosen_title,
    monitoring_snapshots.id AS snapshot_id,
    monitoring_snapshots.snapshot_date,
    monitoring_snapshots.views,
    monitoring_snapshots.watch_time_minutes,
    monitoring_snapshots.search_views,
    monitoring_snapshots.search_watch_time,
    monitoring_snapshots.views_us,
    monitoring_snapshots.views_gb,
    monitoring_snapshots.views_ca,
    monitoring_snapshots.views_au,
    monitoring_snapshots.views_nz,
    monitoring_snapshots.avg_view_duration,
    monitoring_snapshots.avg_view_percentage,
    monitoring_snapshots.watch_time_us,
    monitoring_snapshots.watch_time_gb,
    monitoring_snapshots.watch_time_ca,
    monitoring_snapshots.watch_time_au,
    monitoring_snapshots.watch_time_nz
  FROM optimizations
  INNER JOIN videos ON videos.id = optimizations.video_id
  LEFT JOIN monitoring_snapshots ON monitoring_snapshots.id = (
    SELECT ms.id
    FROM monitoring_snapshots ms
    WHERE ms.video_id = videos.id
      AND (ms.optimization_id = optimizations.id OR ms.optimization_id IS NULL)
    ORDER BY ms.snapshot_date DESC, ms.id DESC
    LIMIT 1
  )
  WHERE optimizations.status = 'applied'
  ORDER BY optimizations.applied_at DESC, optimizations.id DESC
`);

function getDaysBetween(startDate, endDate) {
  const diff = toDate(endDate).getTime() - toDate(startDate).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

router.get('/summary', (req, res) => {
  try {
    const rows = selectMonitoringSummaryRows.all().map((row) => {
      const daysSinceOptimization = row.applied_at
        ? getDaysBetween(row.applied_at, new Date())
        : 0;
      const daysRemaining = Math.max(0, 30 - daysSinceOptimization);

      return {
        ...row,
        latest_snapshot: row.snapshot_id
          ? {
              id: row.snapshot_id,
              snapshot_date: row.snapshot_date,
              views: row.views,
              watch_time_minutes: row.watch_time_minutes,
              search_views: row.search_views,
              search_watch_time: row.search_watch_time,
              views_us: row.views_us,
              views_gb: row.views_gb,
              views_ca: row.views_ca,
              views_au: row.views_au,
              views_nz: row.views_nz,
              avg_view_duration: row.avg_view_duration,
              avg_view_percentage: row.avg_view_percentage,
              watch_time_us: row.watch_time_us,
              watch_time_gb: row.watch_time_gb,
              watch_time_ca: row.watch_time_ca,
              watch_time_au: row.watch_time_au,
              watch_time_nz: row.watch_time_nz
            }
          : null,
        days_since_optimization: daysSinceOptimization,
        days_remaining: daysRemaining
      };
    });

    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch monitoring summary:', error);
    res.status(500).json({ error: 'Failed to fetch monitoring summary.' });
  }
});

router.get('/:videoId', (req, res) => {
  try {
    const video = selectVideoById.get(req.params.videoId);

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    const optimization = selectLatestOptimizationForVideo.get(req.params.videoId) || null;
    const snapshots = selectSnapshotsForVideo.all(req.params.videoId);
    const delta = getSnapshotDelta(req.params.videoId);

    res.json({ video, optimization, snapshots, delta });
  } catch (error) {
    console.error('Failed to fetch monitoring detail:', error);
    res.status(500).json({ error: 'Failed to fetch monitoring detail.' });
  }
});

router.post('/:videoId/snapshot', async (req, res) => {
  try {
    const optimization = selectLatestOptimizationForVideo.get(req.params.videoId);
    const snapshot = await takeSnapshot(
      Number(req.params.videoId),
      optimization?.id
    );

    res.json(snapshot);
  } catch (error) {
    console.error('Failed to take monitoring snapshot:', error);
    res.status(500).json({ error: error.message || 'Failed to take snapshot.' });
  }
});

module.exports = router;
