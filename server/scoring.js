const Anthropic = require('@anthropic-ai/sdk');

const db = require('./db');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const selectLatestMonitoringSnapshot = db.prepare(`
  SELECT *
  FROM monitoring_snapshots
  WHERE video_id = ?
  ORDER BY snapshot_date DESC, id DESC
  LIMIT 1
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampScore(score) {
  return Math.max(0, Math.min(10, score));
}

function clampInternalScore(score) {
  return Math.max(1, Math.min(100, Math.round(score)));
}

function clampHundredScore(score) {
  return Math.max(1, Math.min(100, Number(score || 0)));
}

function getContentType(durationSeconds) {
  return Number(durationSeconds || 0) < 180 ? 'short' : 'long_form';
}

function getEra(publishedAt) {
  if (!publishedAt) {
    return 'unknown';
  }

  return String(new Date(publishedAt).getUTCFullYear());
}

function toDisplayScore(internalScore) {
  return Math.round(internalScore) / 10;
}

function parseTags(tagsValue) {
  try {
    return JSON.parse(tagsValue || '[]');
  } catch (error) {
    return [];
  }
}

function cleanClaudeJson(text) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/, '')
    .trim();
}

function getViewsPerDay(video) {
  const publishedDate = video?.published_at ? new Date(video.published_at) : null;

  if (!publishedDate || Number.isNaN(publishedDate.getTime())) {
    return 0;
  }

  const ageInDays = Math.max(
    1,
    (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return Number(video.view_count || 0) / ageInDays;
}

function getAgeBonus(publishedAt) {
  if (!publishedAt) {
    return 0;
  }

  const publishedDate = new Date(publishedAt);
  const ageInMs = Date.now() - publishedDate.getTime();
  const ageInYears = ageInMs / (1000 * 60 * 60 * 24 * 365.25);

  if (ageInYears > 3) {
    return 2;
  }

  if (ageInYears >= 1) {
    return 1;
  }

  return -1;
}

function getInternalAgeBonus(publishedAt) {
  return getAgeBonus(publishedAt) * 10;
}

function getFallbackScoreResult() {
  return {
    audit_score: 0,
    audit_score_reason: 'Scoring failed',
    evergreen_potential: 'low',
    primary_problem: 'good_as_is',
    audit_score_breakdown: {
      internal_score: 0,
      base_score: 0,
      age_bonus: 0,
      final_score: 0,
      ctr_assessment: 'Scoring failed',
      keyword_quality: 'Scoring failed',
      title_clarity: 'Scoring failed',
      evergreen_topic: 'Scoring failed',
      content_type: 'unknown',
      era: 'unknown',
      relative_performance_note: 'Scoring failed'
    }
  };
}

function buildV2Prompt(video) {
  const description = (video.description_current || '').slice(0, 500);
  const tags = parseTags(video.tags);
  const contentType = getContentType(video.duration_seconds);
  const era = getEra(video.published_at);

  return `
You are scoring a YouTube video's metadata quality. Return numeric scores only.

Video:
- Title: ${JSON.stringify(video.title_current || '')}
- Description (first 500 chars): ${JSON.stringify(description)}
- Tags: ${JSON.stringify(tags)}
- Content type: ${JSON.stringify(contentType)}
- Era: ${JSON.stringify(era)}
- Channel context: Family travel YouTube channel. Target audience is English-speaking families in US, UK, Canada, Australia, New Zealand searching for travel destination guides, family travel tips, and travel vlogs.

Score each dimension from 1-100 relative to other videos of the same content_type and era:

keyword_score: How well does the TITLE contain searchable keywords that match what people actually search for? (1-100)
clarity_score: Does the title clearly communicate what the video is about? (1-100)
evergreen_score: Will this topic still be searched in 2+ years? (1-100)

Also identify primary_problem as exactly one of:
low_ctr | poor_discoverability | dated_language | weak_keywords | good_as_is

Important: primary_problem must be consistent with your scores. If keyword_score < 60 then primary_problem should be weak_keywords or poor_discoverability. If clarity_score < 60 then primary_problem should be low_ctr. If all scores are above 70 then primary_problem should be good_as_is.

Return valid JSON only, no markdown, no prose:
{
  "keyword_score": number,
  "clarity_score": number,
  "evergreen_score": number,
  "primary_problem": string
}
`.trim();
}

function buildExplainPrompt(video) {
  const description = (video.description_current || '').slice(0, 500);
  const tags = parseTags(video.tags);
  const contentType = getContentType(video.duration_seconds);
  const era = getEra(video.published_at);

  return `
Given this YouTube video's metadata and scores, provide a detailed explanation.

Video:
- Title: ${JSON.stringify(video.title_current || '')}
- Description (first 500 chars): ${JSON.stringify(description)}
- Tags: ${JSON.stringify(tags)}
- Content type: ${JSON.stringify(contentType)}
- Era: ${JSON.stringify(era)}
- Keyword Score: ${clampHundredScore(video.keyword_score)}/100
- Clarity Score: ${clampHundredScore(video.clarity_score)}/100
- Evergreen Score: ${clampHundredScore(video.evergreen_score)}/100
- Primary Problem: ${JSON.stringify(video.primary_problem || 'poor_discoverability')}

Return valid JSON only, no markdown:
{
  "audit_score_reason": "2-3 sentences explaining overall score",
  "keyword_quality_notes": "1-2 sentences on keyword strengths/gaps",
  "title_clarity_notes": "1-2 sentences on title clarity",
  "evergreen_notes": "1-2 sentences on evergreen potential",
  "relative_performance_note": "1 sentence comparing to typical videos of same type and era",
  "ctr_assessment": "1-2 sentences on click-through potential"
}
`.trim();
}

function buildPrompt(video) {
  const description = (video.description_current || '').slice(0, 500);
  const tags = parseTags(video.tags);
  const contentType = getContentType(video.duration_seconds);
  const era = getEra(video.published_at);

  return `
You are auditing YouTube videos for reoptimization potential.

Video data:
- Title: ${JSON.stringify(video.title_current || '')}
- Description (first 500 chars): ${JSON.stringify(description)}
- Published at: ${JSON.stringify(video.published_at || '')}
- Duration seconds: ${JSON.stringify(video.duration_seconds)}
- Tags: ${JSON.stringify(tags)}
- Content type: ${JSON.stringify(contentType)}
- Era: ${JSON.stringify(era)}

Instructions:
- Score the video from 1 to 100 for reoptimization potential as "internal_score".
- Compare this video only against other YouTube videos of the same content_type and era, not YouTube in general.
- Do not apply age weighting yourself.
- Age weighting happens after your internal score:
  - older than 3 years: +20
  - 1 to 3 years: +10
  - under 1 year: -10
- Identify primary_problem as exactly one of:
  low_ctr, poor_discoverability, dated_language, weak_keywords, good_as_is
- Identify evergreen_potential as exactly one of:
  high, medium, low
- Write audit_score_reason in 2 to 3 sentences explaining the score.
- Write relative_performance_note as exactly 1 sentence comparing this video's title/metadata quality to a typical video of the same content_type and era.
- Return score_breakdown with exactly these fields:
  internal_score, base_score, age_bonus, final_score, ctr_assessment, keyword_quality, title_clarity, evergreen_topic, content_type, era, relative_performance_note

Return valid JSON only with this shape:
{
  "internal_score": number,
  "primary_problem": "low_ctr" | "poor_discoverability" | "dated_language" | "weak_keywords" | "good_as_is",
  "evergreen_potential": "high" | "medium" | "low",
  "audit_score_reason": "string",
  "relative_performance_note": "string",
  "score_breakdown": {
    "internal_score": number,
    "base_score": number,
    "age_bonus": number,
    "final_score": number,
    "ctr_assessment": "string",
    "keyword_quality": "string",
    "title_clarity": "string",
    "evergreen_topic": "string",
    "content_type": "short" | "long_form",
    "era": "string",
    "relative_performance_note": "string"
  }
}
`.trim();
}

function calculateCompositeScore(video, channelMedianViewsPerDay) {
  const publishedDate = video?.published_at ? new Date(video.published_at) : null;
  const ageInDays = publishedDate && !Number.isNaN(publishedDate.getTime())
    ? Math.max(1, (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24))
    : 1;
  const ageInYears = ageInDays / 365.25;
  let ageComponent = 5;

  if (ageInYears >= 3) {
    ageComponent = 25;
  } else if (ageInYears >= 2) {
    ageComponent = 20;
  } else if (ageInYears >= 1) {
    ageComponent = 15;
  } else if (ageInDays >= 183) {
    ageComponent = 10;
  }

  const viewsPerDay = getViewsPerDay(video);
  const medianViewsPerDay =
    Number(channelMedianViewsPerDay) > 0 ? Number(channelMedianViewsPerDay) : null;
  const ratio = medianViewsPerDay ? viewsPerDay / medianViewsPerDay : 1;
  let performanceGapComponent = 0;

  if (!medianViewsPerDay) {
    performanceGapComponent = 20;
  } else if (ratio < 0.1) {
    performanceGapComponent = 35;
  } else if (ratio < 0.25) {
    performanceGapComponent = 28;
  } else if (ratio < 0.5) {
    performanceGapComponent = 20;
  } else if (ratio < 0.75) {
    performanceGapComponent = 12;
  } else if (ratio <= 1) {
    performanceGapComponent = 6;
  }

  let claudeComponent = 15;

  if (Number(video.scoring_version) === 2) {
    const keywordScore = clampHundredScore(video.keyword_score);
    const clarityScore = clampHundredScore(video.clarity_score);
    const evergreenScore = clampHundredScore(video.evergreen_score);
    claudeComponent =
      ((keywordScore * 0.45 + clarityScore * 0.35 + evergreenScore * 0.2) / 100) * 30;
  } else {
    try {
      const breakdown = JSON.parse(video.audit_score_breakdown || '{}');
      const internalScore = Number(breakdown.internal_score);

      if (Number.isFinite(internalScore) && internalScore > 0) {
        claudeComponent = (clampHundredScore(internalScore) / 100) * 30;
      }
    } catch (error) {
      claudeComponent = 15;
    }
  }

  const latestSnapshot = video?.id ? selectLatestMonitoringSnapshot.get(video.id) : null;
  const avgViewPercentage = latestSnapshot
    ? Number(latestSnapshot.avg_view_percentage)
    : null;
  let fixabilityComponent = 5;

  if (avgViewPercentage != null && Number.isFinite(avgViewPercentage)) {
    if (avgViewPercentage >= 35) {
      fixabilityComponent = 10;
    } else if (avgViewPercentage >= 25) {
      fixabilityComponent = 7;
    } else if (avgViewPercentage >= 15) {
      fixabilityComponent = 4;
    } else {
      fixabilityComponent = 1;
    }
  }

  const finalScore =
    (ageComponent + performanceGapComponent + claudeComponent + fixabilityComponent) / 10;

  return Math.max(0, Math.min(10, Math.round(finalScore * 10) / 10));
}

function normalizeScoreResult(parsed, video) {
  const internalAgeBonus = getInternalAgeBonus(video.published_at);
  const baseInternalScore = clampInternalScore(Number(parsed.internal_score || 0));
  const finalInternalScore = clampInternalScore(baseInternalScore + internalAgeBonus);
  const scoreBreakdown = parsed.score_breakdown || {};
  const contentType = getContentType(video.duration_seconds);
  const era = getEra(video.published_at);
  const relativePerformanceNote =
    parsed.relative_performance_note ||
    scoreBreakdown.relative_performance_note ||
    '';

  return {
    audit_score: toDisplayScore(finalInternalScore),
    audit_score_reason: parsed.audit_score_reason || 'Scoring failed',
    evergreen_potential: parsed.evergreen_potential || 'low',
    primary_problem: parsed.primary_problem || 'good_as_is',
    audit_score_breakdown: {
      internal_score: finalInternalScore,
      base_score: toDisplayScore(baseInternalScore),
      age_bonus: internalAgeBonus / 10,
      final_score: toDisplayScore(finalInternalScore),
      ctr_assessment: scoreBreakdown.ctr_assessment || '',
      keyword_quality: scoreBreakdown.keyword_quality || '',
      title_clarity: scoreBreakdown.title_clarity || '',
      evergreen_topic: scoreBreakdown.evergreen_topic || '',
      content_type: scoreBreakdown.content_type || contentType,
      era: scoreBreakdown.era || era,
      relative_performance_note: relativePerformanceNote
    }
  };
}

async function scoreVideo(video) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: buildPrompt(video)
        }
      ]
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const cleaned = cleanClaudeJson(text);

    try {
      const parsed = JSON.parse(cleaned);
      return normalizeScoreResult(parsed, video);
    } catch (error) {
      console.error(`Failed to parse Claude scoring JSON for video ${video.youtube_id}:`, error);
      console.error('Claude raw response:', text);
      return getFallbackScoreResult();
    }
  } catch (error) {
    console.error(`Failed to score video ${video.youtube_id}:`, error);
    return getFallbackScoreResult();
  }
}

async function scoreVideoV2(video) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: buildV2Prompt(video)
        }
      ]
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const cleaned = cleanClaudeJson(text);
    const parsed = JSON.parse(cleaned);

    return {
      keyword_score: clampHundredScore(parsed.keyword_score),
      clarity_score: clampHundredScore(parsed.clarity_score),
      evergreen_score: clampHundredScore(parsed.evergreen_score),
      primary_problem: parsed.primary_problem || 'poor_discoverability',
      scoring_version: 2
    };
  } catch (error) {
    console.error(`Failed to score video v2 ${video.youtube_id}:`, error);
    return {
      keyword_score: 50,
      clarity_score: 50,
      evergreen_score: 50,
      primary_problem: 'poor_discoverability',
      scoring_version: 2,
      failed: true
    };
  }
}

async function explainVideoScore(video) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: buildExplainPrompt(video)
        }
      ]
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const cleaned = cleanClaudeJson(text);

    return JSON.parse(cleaned);
  } catch (error) {
    console.error(`Failed to explain video score ${video.youtube_id}:`, error);
    return null;
  }
}

async function scoreAllVideos(videosToScore) {
  const videos =
    videosToScore || db.prepare('SELECT * FROM videos ORDER BY published_at ASC').all();
  let scored = 0;

  for (let index = 0; index < videos.length; index += 1) {
    const video = videos[index];
    console.log(`Scoring video ${index + 1}/${videos.length}: ${video.youtube_id}`);

    const result = await scoreVideo(video);

    updateVideoScore.run({
      id: video.id,
      audit_score: result.audit_score,
      audit_score_breakdown: JSON.stringify(result.audit_score_breakdown),
      audit_score_reason: result.audit_score_reason,
      evergreen_potential: result.evergreen_potential,
      primary_problem: result.primary_problem
    });

    scored += 1;
    console.log(`Finished scoring video ${index + 1}/${videos.length}: ${video.youtube_id}`);

    if (index < videos.length - 1) {
      await sleep(500);
    }
  }

  return { scored };
}

module.exports = {
  calculateCompositeScore,
  explainVideoScore,
  scoreAllVideos,
  scoreVideo,
  scoreVideoV2
};
