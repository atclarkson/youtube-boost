const express = require('express');

const db = require('../db');
const { incrementApprovals, getTodayApprovalCount } = require('../dailyLog');
const { takeBaselineSnapshot } = require('../monitor');
const { generateOptions } = require('../optimizer');
const { updateVideo } = require('../youtube');

const router = express.Router();

const optimizationSelectSql = `
  SELECT
    optimizations.*,
    videos.youtube_id AS video_youtube_id,
    videos.title_original AS video_title_original,
    videos.title_current AS video_title_current,
    videos.description_original AS video_description_original,
    videos.description_current AS video_description_current,
    videos.published_at AS video_published_at,
    videos.duration_seconds AS video_duration_seconds,
    videos.audit_score AS video_audit_score,
    videos.audit_score_reason AS video_audit_score_reason
  FROM optimizations
  INNER JOIN videos ON videos.id = optimizations.video_id
`;

const selectAllOptimizations = db.prepare(`
  ${optimizationSelectSql}
  ORDER BY optimizations.created_at DESC, optimizations.id DESC
`);
const selectTodayOptimizations = db.prepare(`
  ${optimizationSelectSql}
  WHERE date(optimizations.created_at, 'localtime') = date('now', 'localtime')
  ORDER BY optimizations.created_at DESC, optimizations.id DESC
`);
const selectOptimizationById = db.prepare(`
  ${optimizationSelectSql}
  WHERE optimizations.id = ?
  LIMIT 1
`);
const insertOptimization = db.prepare(`
  INSERT INTO optimizations (
    video_id,
    status,
    title_option_1,
    title_option_1_reasoning,
    title_option_2,
    title_option_2_reasoning,
    title_option_3,
    title_option_3_reasoning
  ) VALUES (
    @video_id,
    'pending',
    @title_option_1,
    @title_option_1_reasoning,
    @title_option_2,
    @title_option_2_reasoning,
    @title_option_3,
    @title_option_3_reasoning
  )
`);
const updateOptimizationApproval = db.prepare(`
  UPDATE optimizations
  SET status = 'approved',
      chosen_title = ?,
      chosen_description = ?
  WHERE id = ?
`);
const updateOptimizationStatus = db.prepare(`
  UPDATE optimizations
  SET status = ?
  WHERE id = ?
`);
const updateOptimizationApplied = db.prepare(`
  UPDATE optimizations
  SET status = 'applied',
      applied_at = datetime('now')
  WHERE id = ?
`);
const updateOptimizationReverted = db.prepare(`
  UPDATE optimizations
  SET status = 'reverted'
  WHERE id = ?
`);
const updateVideoCurrentMetadata = db.prepare(`
  UPDATE videos
  SET title_current = ?, description_current = ?
  WHERE id = ?
`);

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

function serializeOption(option) {
  return JSON.stringify({
    reasoning: option.reasoning,
    search_intent: option.search_intent,
    suggested_description_hook: option.suggested_description_hook
  });
}

function serializeOptimization(row) {
  const option1Meta = parseOptionMetadata(row.title_option_1_reasoning);
  const option2Meta = parseOptionMetadata(row.title_option_2_reasoning);
  const option3Meta = parseOptionMetadata(row.title_option_3_reasoning);

  return {
    id: row.id,
    video_id: row.video_id,
    status: row.status,
    chosen_title: row.chosen_title,
    chosen_description: row.chosen_description,
    applied_at: row.applied_at,
    created_at: row.created_at,
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
    ].filter((option) => option.title),
    video: {
      id: row.video_id,
      youtube_id: row.video_youtube_id,
      title_original: row.video_title_original,
      title_current: row.video_title_current,
      description_original: row.video_description_original,
      description_current: row.video_description_current,
      published_at: row.video_published_at,
      duration_seconds: row.video_duration_seconds,
      audit_score: row.video_audit_score,
      audit_score_reason: row.video_audit_score_reason
    }
  };
}

router.get('/', (req, res) => {
  try {
    const rows = selectAllOptimizations.all().map(serializeOptimization);
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch optimizations:', error);
    res.status(500).json({ error: 'Failed to fetch optimizations.' });
  }
});

router.get('/batch/today', (req, res) => {
  try {
    const optimizations = selectTodayOptimizations.all().map(serializeOptimization);
    const approvalsCount = getTodayApprovalCount();

    res.json({ optimizations, approvalsCount });
  } catch (error) {
    console.error('Failed to fetch today batch:', error);
    res.status(500).json({ error: 'Failed to fetch today batch.' });
  }
});

router.post('/generate/:videoId', async (req, res) => {
  try {
    const videoId = Number(req.params.videoId);
    const options = await generateOptions(videoId);

    const result = insertOptimization.run({
      video_id: videoId,
      title_option_1: options[0].title,
      title_option_1_reasoning: serializeOption(options[0]),
      title_option_2: options[1].title,
      title_option_2_reasoning: serializeOption(options[1]),
      title_option_3: options[2].title,
      title_option_3_reasoning: serializeOption(options[2])
    });

    const optimization = selectOptimizationById.get(result.lastInsertRowid);
    res.json(serializeOptimization(optimization));
  } catch (error) {
    console.error('Failed to generate optimization options:', error);
    res.status(500).json({ error: error.message || 'Failed to generate options.' });
  }
});

router.patch('/:id/approve', async (req, res) => {
  try {
    const optimizationId = Number(req.params.id);
    const optimization = selectOptimizationById.get(optimizationId);

    if (!optimization) {
      return res.status(404).json({ error: 'Optimization not found.' });
    }

    const chosenTitle = String(req.body?.chosen_title || '').trim();
    const chosenDescription = String(req.body?.chosen_description || '').trim();

    if (!chosenTitle || !chosenDescription) {
      return res.status(400).json({ error: 'Chosen title and description are required.' });
    }

    await takeBaselineSnapshot(optimization.video_id);
    updateOptimizationApproval.run(chosenTitle, chosenDescription, optimizationId);
    incrementApprovals(optimization.video_id);

    const updated = selectOptimizationById.get(optimizationId);
    res.json(serializeOptimization(updated));
  } catch (error) {
    console.error('Failed to approve optimization:', error);
    res.status(500).json({ error: error.message || 'Failed to approve optimization.' });
  }
});

router.patch('/:id/skip', (req, res) => {
  try {
    const optimizationId = Number(req.params.id);
    const optimization = selectOptimizationById.get(optimizationId);

    if (!optimization) {
      return res.status(404).json({ error: 'Optimization not found.' });
    }

    updateOptimizationStatus.run('skipped', optimizationId);
    const updated = selectOptimizationById.get(optimizationId);
    res.json(serializeOptimization(updated));
  } catch (error) {
    console.error('Failed to skip optimization:', error);
    res.status(500).json({ error: 'Failed to skip optimization.' });
  }
});

router.post('/:id/apply', async (req, res) => {
  try {
    const optimizationId = Number(req.params.id);
    const optimization = selectOptimizationById.get(optimizationId);

    if (!optimization) {
      return res.status(404).json({ error: 'Optimization not found.' });
    }

    if (!optimization.chosen_title || !optimization.chosen_description) {
      return res.status(400).json({ error: 'Optimization has not been approved yet.' });
    }

    if (optimization.status !== 'approved') {
      return res.status(400).json({ error: 'Only approved optimizations can be applied.' });
    }

    if (req.body?.dryRun) {
      return res.json({
        dryRun: true,
        wouldUpdate: {
          youtubeId: optimization.video_youtube_id,
          title: optimization.chosen_title,
          description: '[unchanged]'
        }
      });
    }

    const result = await updateVideo(
      optimization.video_youtube_id,
      optimization.chosen_title,
      optimization.video_description_current
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to apply optimization.' });
    }

    updateOptimizationApplied.run(optimizationId);
    updateVideoCurrentMetadata.run(
      optimization.chosen_title,
      optimization.chosen_description,
      optimization.video_id
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to apply optimization:', error);
    res.status(500).json({ error: error.message || 'Failed to apply optimization.' });
  }
});

router.post('/:id/revert', async (req, res) => {
  try {
    const optimizationId = Number(req.params.id);
    const optimization = selectOptimizationById.get(optimizationId);

    if (!optimization) {
      return res.status(404).json({ error: 'Optimization not found.' });
    }

    if (optimization.status !== 'applied') {
      return res.status(400).json({ error: 'Only applied optimizations can be reverted.' });
    }

    const originalTitle = optimization.video_title_original || optimization.video_title_current;
    const originalDescription =
      optimization.video_description_original || optimization.video_description_current;

    const result = await updateVideo(
      optimization.video_youtube_id,
      originalTitle,
      originalDescription
    );

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to revert optimization.' });
    }

    updateOptimizationReverted.run(optimizationId);
    updateVideoCurrentMetadata.run(
      originalTitle,
      originalDescription,
      optimization.video_id
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to revert optimization:', error);
    res.status(500).json({ error: error.message || 'Failed to revert optimization.' });
  }
});

module.exports = router;
