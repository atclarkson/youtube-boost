const express = require('express');

const db = require('../db');
const { scoreAllVideos } = require('../scoring');
const { getAllVideos } = require('../youtube');

const router = express.Router();

const upsertVideo = db.prepare(`
  INSERT INTO videos (
    youtube_id,
    title_original,
    title_current,
    description_original,
    description_current,
    published_at,
    duration_seconds,
    category_id,
    tags,
    last_synced_at
  ) VALUES (
    @youtube_id,
    @title_original,
    @title_current,
    @description_original,
    @description_current,
    @published_at,
    @duration_seconds,
    @category_id,
    @tags,
    @last_synced_at
  )
  ON CONFLICT(youtube_id) DO UPDATE SET
    title_original = COALESCE(videos.title_original, excluded.title_original),
    title_current = excluded.title_current,
    description_original = COALESCE(videos.description_original, excluded.description_original),
    description_current = excluded.description_current,
    published_at = excluded.published_at,
    duration_seconds = excluded.duration_seconds,
    category_id = excluded.category_id,
    tags = excluded.tags,
    last_synced_at = excluded.last_synced_at
`);

router.get('/sync', async (req, res) => {
  try {
    const videos = await getAllVideos();
    const now = new Date().toISOString();

    const syncTransaction = db.transaction((items) => {
      for (const video of items) {
        upsertVideo.run({
          youtube_id: video.id,
          title_original: video.title,
          title_current: video.title,
          description_original: video.description,
          description_current: video.description,
          published_at: video.publishedAt,
          duration_seconds: video.duration,
          category_id: video.categoryId,
          tags: JSON.stringify(video.tags || []),
          last_synced_at: now
        });
      }
    });

    syncTransaction(videos);

    const scoringResult = await scoreAllVideos();

    res.json({ synced: videos.length, scored: scoringResult.scored });
  } catch (error) {
    console.error('Failed to sync YouTube videos:', error);
    const isAuthError =
      error.message === 'Not authenticated. token.json not found.' ||
      error.message === 'Stored Google OAuth token is invalid.';

    res
      .status(isAuthError ? 401 : 500)
      .json({ error: error.message || 'Failed to sync videos.' });
  }
});

router.get('/audit', (req, res) => {
  try {
    const videos = db.prepare(`
      SELECT
        videos.*,
        COALESCE(
          CASE
            WHEN videos.audit_score IS NULL THEN 'not_scored'
            WHEN (
              SELECT status
              FROM optimizations
              WHERE optimizations.video_id = videos.id
              ORDER BY optimizations.id DESC
              LIMIT 1
            ) IN ('applied', 'reverted') THEN (
              SELECT status
              FROM optimizations
              WHERE optimizations.video_id = videos.id
              ORDER BY optimizations.id DESC
              LIMIT 1
            )
            ELSE 'pending'
          END,
          'pending'
        ) AS audit_status
      FROM videos
      ORDER BY audit_score DESC, published_at ASC
    `).all();

    res.json(videos);
  } catch (error) {
    console.error('Failed to fetch audit videos:', error);
    res.status(500).json({ error: 'Failed to fetch audit videos.' });
  }
});

router.get('/', (req, res) => {
  try {
    const videos = db
      .prepare('SELECT * FROM videos ORDER BY published_at ASC')
      .all();

    res.json(videos);
  } catch (error) {
    console.error('Failed to fetch videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos.' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const video = db
      .prepare('SELECT * FROM videos WHERE id = ?')
      .get(req.params.id);

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    res.json(video);
  } catch (error) {
    console.error('Failed to fetch video:', error);
    res.status(500).json({ error: 'Failed to fetch video.' });
  }
});

module.exports = router;
