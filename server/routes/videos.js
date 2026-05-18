const express = require('express');

const db = require('../db');
const { getVideoAnalytics, getVideoRetentionData } = require('../analytics');
const { scoreVideo } = require('../scoring');
const { getPacificDateString } = require('../time');
const { getAllVideos } = require('../youtube');

const router = express.Router();
let scoringProgress = {
  inProgress: false,
  current: 0,
  total: 0,
  currentTitle: '',
  failedCount: 0,
  failedVideos: []
};

const selectVideosForDevScoreLimit = db.prepare(`
  SELECT *
  FROM videos
  ORDER BY published_at ASC
  LIMIT ?
`);
const selectVideoByYoutubeId = db.prepare(`
  SELECT *
  FROM videos
  WHERE youtube_id = ?
`);
const selectOptimizationsForVideo = db.prepare(`
  SELECT *
  FROM optimizations
  WHERE video_id = ?
  ORDER BY created_at DESC, id DESC
`);
const selectLatestMonitoringSnapshotForVideo = db.prepare(`
  SELECT *
  FROM monitoring_snapshots
  WHERE video_id = ?
  ORDER BY snapshot_date DESC, id DESC
  LIMIT 1
`);
const selectLatestBaselineSnapshotForVideo = db.prepare(`
  SELECT *
  FROM baseline_snapshots
  WHERE video_id = ?
  ORDER BY captured_at DESC, id DESC
  LIMIT 1
`);
const selectLatestAiVerdictForVideo = db.prepare(`
  SELECT *
  FROM ai_verdicts
  WHERE video_id = ?
  ORDER BY verdict_date DESC, id DESC
  LIMIT 1
`);
const selectRankedPublicLongFormVideos = db.prepare(`
  SELECT youtube_id, title_current, audit_score
  FROM videos
  WHERE privacy_status = 'public'
    AND COALESCE(hidden, 0) = 0
    AND duration_seconds >= 180
    AND audit_score IS NOT NULL
  ORDER BY audit_score DESC, published_at ASC, id ASC
`);
const updateVideoHiddenStatus = db.prepare(`
  UPDATE videos
  SET hidden = ?
  WHERE youtube_id = ?
`);
const selectAllVideosForScoring = db.prepare(`
  SELECT *
  FROM videos
  ORDER BY published_at ASC
`);
const selectUnscoredVideosForScoring = db.prepare(`
  SELECT *
  FROM videos
  WHERE audit_score IS NULL OR audit_score = 0
  ORDER BY published_at ASC
`);
const selectVideoCount = db.prepare(`
  SELECT COUNT(*) AS count
  FROM videos
`);
const selectUnscoredVideoCount = db.prepare(`
  SELECT COUNT(*) AS count
  FROM videos
  WHERE audit_score IS NULL OR audit_score = 0
`);
const updateVideoScore = db.prepare(`
  UPDATE videos
  SET
    audit_score = @audit_score,
    audit_score_breakdown = @audit_score_breakdown,
    audit_score_reason = @audit_score_reason,
    evergreen_potential = @evergreen_potential,
    primary_problem = @primary_problem
  WHERE id = @id
`);

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
    privacy_status,
    tags,
    view_count,
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
    @privacy_status,
    @tags,
    @view_count,
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
    privacy_status = excluded.privacy_status,
    tags = excluded.tags,
    view_count = excluded.view_count,
    last_synced_at = excluded.last_synced_at
`);

function getDevScoreLimit() {
  const devScoreLimit = Number.parseInt(process.env.DEV_SCORE_LIMIT, 10);

  if (Number.isInteger(devScoreLimit) && devScoreLimit > 0) {
    return devScoreLimit;
  }

  return null;
}

function applyDevScoreLimit(videos) {
  const devScoreLimit = getDevScoreLimit();

  if (devScoreLimit) {
    return videos.slice(0, devScoreLimit);
  }

  return videos;
}

function parseOptionMetadata(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return {
      reasoning: String(parsed.reasoning || ''),
      search_intent: String(parsed.search_intent || ''),
      suggested_description_hook: String(parsed.suggested_description_hook || '')
    };
  } catch (error) {
    return {
      reasoning: String(value || ''),
      search_intent: '',
      suggested_description_hook: ''
    };
  }
}

function serializeOptimization(row) {
  const option1Meta = parseOptionMetadata(row.title_option_1_reasoning);
  const option2Meta = parseOptionMetadata(row.title_option_2_reasoning);
  const option3Meta = parseOptionMetadata(row.title_option_3_reasoning);

  return {
    ...row,
    options: [
      {
        title: row.title_option_1,
        reasoning: option1Meta.reasoning,
        search_intent: option1Meta.search_intent,
        suggested_description_hook: option1Meta.suggested_description_hook
      },
      {
        title: row.title_option_2,
        reasoning: option2Meta.reasoning,
        search_intent: option2Meta.search_intent,
        suggested_description_hook: option2Meta.suggested_description_hook
      },
      {
        title: row.title_option_3,
        reasoning: option3Meta.reasoning,
        search_intent: option3Meta.search_intent,
        suggested_description_hook: option3Meta.suggested_description_hook
      }
    ].filter((option) => option.title)
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isScoringFailure(result) {
  return result.audit_score === 0 && result.audit_score_reason === 'Scoring failed';
}

async function scoreVideoWithRetry(video) {
  let result = await scoreVideo(video);

  if (!isScoringFailure(result)) {
    return { result, failed: false, errorMessage: '' };
  }

  await sleep(2000);
  result = await scoreVideo(video);

  if (!isScoringFailure(result)) {
    return { result, failed: false, errorMessage: '' };
  }

  return {
    result,
    failed: true,
    errorMessage: result.audit_score_reason || 'Scoring failed'
  };
}

async function runBackgroundScoring(videos) {
  scoringProgress = {
    inProgress: true,
    current: 0,
    total: videos.length,
    currentTitle: '',
    failedCount: 0,
    failedVideos: []
  };

  try {
    for (let index = 0; index < videos.length; index += 1) {
      const video = videos[index];
      scoringProgress.current = index + 1;
      scoringProgress.currentTitle = video.title_current || '';

      const { result, failed, errorMessage } = await scoreVideoWithRetry(video);

      updateVideoScore.run({
        id: video.id,
        audit_score: result.audit_score,
        audit_score_breakdown: JSON.stringify(result.audit_score_breakdown),
        audit_score_reason: result.audit_score_reason,
        evergreen_potential: result.evergreen_potential,
        primary_problem: result.primary_problem
      });

      if (failed) {
        scoringProgress.failedCount += 1;
        scoringProgress.failedVideos.push({
          youtube_id: video.youtube_id,
          title_current: video.title_current,
          error: errorMessage
        });
      }
    }
  } catch (error) {
    console.error('Background scoring failed:', error);
  } finally {
    scoringProgress.inProgress = false;
    scoringProgress.current = 0;
    scoringProgress.total = 0;
    scoringProgress.currentTitle = '';
  }
}

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
          privacy_status: video.privacyStatus,
          tags: JSON.stringify(video.tags || []),
          view_count: video.viewCount,
          last_synced_at: now
        });
      }
    });

    syncTransaction(videos);

    res.json({ synced: videos.length });
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

router.get('/count', (req, res) => {
  try {
    const row = selectVideoCount.get();
    res.json({ count: row.count });
  } catch (error) {
    console.error('Failed to count videos:', error);
    res.status(500).json({ error: 'Failed to count videos.' });
  }
});

router.get('/unscored-count', (req, res) => {
  try {
    const row = selectUnscoredVideoCount.get();
    res.json({ count: row.count });
  } catch (error) {
    console.error('Failed to count unscored videos:', error);
    res.status(500).json({ error: 'Failed to count unscored videos.' });
  }
});

router.get('/scoring-status', (req, res) => {
  res.json(scoringProgress);
});

router.patch('/:youtubeId/hide', (req, res) => {
  try {
    const video = selectVideoByYoutubeId.get(req.params.youtubeId);

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    updateVideoHiddenStatus.run(1, req.params.youtubeId);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to hide video:', error);
    res.status(500).json({ error: 'Failed to hide video.' });
  }
});

router.patch('/:youtubeId/unhide', (req, res) => {
  try {
    const video = selectVideoByYoutubeId.get(req.params.youtubeId);

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    updateVideoHiddenStatus.run(0, req.params.youtubeId);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to unhide video:', error);
    res.status(500).json({ error: 'Failed to unhide video.' });
  }
});

router.post('/score-all', async (req, res) => {
  try {
    const videos = applyDevScoreLimit(selectAllVideosForScoring.all());

    res.json({ started: true, total: videos.length });

    (async () => {
      await runBackgroundScoring(videos);
    })();
  } catch (error) {
    console.error('Failed to start scoring all videos:', error);
    res.status(500).json({ error: error.message || 'Failed to score videos.' });
  }
});

router.post('/score-unscored', async (req, res) => {
  try {
    const videos = applyDevScoreLimit(selectUnscoredVideosForScoring.all());

    res.json({ started: true, total: videos.length });

    (async () => {
      await runBackgroundScoring(videos);
    })();
  } catch (error) {
    console.error('Failed to start scoring unscored videos:', error);
    res.status(500).json({ error: error.message || 'Failed to score videos.' });
  }
});

router.post('/:youtubeId/score', async (req, res) => {
  try {
    const video = selectVideoByYoutubeId.get(req.params.youtubeId);

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    const result = await scoreVideo(video);

    updateVideoScore.run({
      id: video.id,
      audit_score: result.audit_score,
      audit_score_breakdown: JSON.stringify(result.audit_score_breakdown),
      audit_score_reason: result.audit_score_reason,
      evergreen_potential: result.evergreen_potential,
      primary_problem: result.primary_problem
    });

    const updatedVideo = selectVideoByYoutubeId.get(req.params.youtubeId);

    res.json(updatedVideo);
  } catch (error) {
    console.error('Failed to score video:', error);
    res.status(500).json({ error: error.message || 'Failed to score video.' });
  }
});

router.get('/audit', (req, res) => {
  try {
    const includeHidden = req.query.showHidden === '1';
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
      ${includeHidden ? '' : 'WHERE COALESCE(videos.hidden, 0) = 0'}
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

router.get('/:youtubeId/detail', (req, res) => {
  (async () => {
    try {
    const video = selectVideoByYoutubeId.get(req.params.youtubeId);

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    const optimizations = selectOptimizationsForVideo
      .all(video.id)
      .map(serializeOptimization);
    const monitoringSnapshot = selectLatestMonitoringSnapshotForVideo.get(video.id) || null;
    const baselineSnapshot = selectLatestBaselineSnapshotForVideo.get(video.id) || null;
    const aiVerdict = selectLatestAiVerdictForVideo.get(video.id) || null;
    const rankedVideos = selectRankedPublicLongFormVideos.all();
    const currentIndex = rankedVideos.findIndex(
      (rankedVideo) => rankedVideo.youtube_id === video.youtube_id
    );
    let lifetimeAnalytics = null;

    try {
      lifetimeAnalytics = await getVideoAnalytics(
        video.youtube_id,
        getPacificDateString(video.published_at),
        getPacificDateString(new Date())
      );
    } catch (error) {
      console.error('Failed to fetch lifetime analytics for detail view:', error.message);
      lifetimeAnalytics = null;
    }

    const prevVideo =
      currentIndex >= 0 && currentIndex < rankedVideos.length - 1
        ? rankedVideos[currentIndex + 1]
        : null;
    const nextVideo =
      currentIndex > 0
        ? rankedVideos[currentIndex - 1]
        : null;

    res.json({
      video,
      optimizations,
      monitoring_snapshot: monitoringSnapshot,
      baseline_snapshot: baselineSnapshot,
      ai_verdict: aiVerdict,
      lifetime_analytics: lifetimeAnalytics,
      prev_video: prevVideo,
      next_video: nextVideo
    });
    } catch (error) {
      console.error('Failed to fetch video detail:', error);
      res.status(500).json({ error: 'Failed to fetch video detail.' });
    }
  })();
});

router.get('/:youtubeId/retention', async (req, res) => {
  try {
    const video = selectVideoByYoutubeId.get(req.params.youtubeId);

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    const retentionData = await getVideoRetentionData(req.params.youtubeId);
    res.json(retentionData);
  } catch (error) {
    console.error('Failed to fetch retention data:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch retention data.' });
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
