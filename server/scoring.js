const Anthropic = require('@anthropic-ai/sdk');

const db = require('./db');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

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

function getFallbackScoreResult() {
  return {
    audit_score: 0,
    audit_score_reason: 'Scoring failed',
    evergreen_potential: 'low',
    primary_problem: 'good_as_is',
    audit_score_breakdown: {
      base_score: 0,
      age_bonus: 0,
      final_score: 0,
      ctr_assessment: 'Scoring failed',
      keyword_quality: 'Scoring failed',
      title_clarity: 'Scoring failed',
      evergreen_topic: 'Scoring failed'
    }
  };
}

function buildPrompt(video) {
  const description = (video.description_current || '').slice(0, 500);
  const tags = (() => {
    try {
      return JSON.parse(video.tags || '[]');
    } catch (error) {
      return [];
    }
  })();

  return `
You are auditing YouTube videos for reoptimization potential.

Video data:
- Title: ${JSON.stringify(video.title_current || '')}
- Description (first 500 chars): ${JSON.stringify(description)}
- Published at: ${JSON.stringify(video.published_at || '')}
- Duration seconds: ${JSON.stringify(video.duration_seconds)}
- Tags: ${JSON.stringify(tags)}

Instructions:
- Score the video from 1 to 10 for reoptimization potential as "base_score".
- Do not apply age weighting yourself.
- Age weighting happens after your base score:
  - older than 3 years: +2
  - 1 to 3 years: +1
  - under 1 year: -1
- Identify primary_problem as exactly one of:
  low_ctr, poor_discoverability, dated_language, weak_keywords, good_as_is
- Identify evergreen_potential as exactly one of:
  high, medium, low
- Write audit_score_reason in 2 to 3 sentences explaining the score.
- Return score_breakdown with exactly these fields:
  base_score, age_bonus, final_score, ctr_assessment, keyword_quality, title_clarity, evergreen_topic

Return valid JSON only with this shape:
{
  "base_score": number,
  "primary_problem": "low_ctr" | "poor_discoverability" | "dated_language" | "weak_keywords" | "good_as_is",
  "evergreen_potential": "high" | "medium" | "low",
  "audit_score_reason": "string",
  "score_breakdown": {
    "base_score": number,
    "age_bonus": number,
    "final_score": number,
    "ctr_assessment": "string",
    "keyword_quality": "string",
    "title_clarity": "string",
    "evergreen_topic": "string"
  }
}
`.trim();
}

function normalizeScoreResult(parsed, ageBonus) {
  const baseScore = clampScore(Number(parsed.base_score || 0));
  const finalScore = clampScore(baseScore + ageBonus);
  const scoreBreakdown = parsed.score_breakdown || {};

  return {
    audit_score: finalScore,
    audit_score_reason: parsed.audit_score_reason || 'Scoring failed',
    evergreen_potential: parsed.evergreen_potential || 'low',
    primary_problem: parsed.primary_problem || 'good_as_is',
    audit_score_breakdown: {
      base_score: baseScore,
      age_bonus: ageBonus,
      final_score: finalScore,
      ctr_assessment: scoreBreakdown.ctr_assessment || '',
      keyword_quality: scoreBreakdown.keyword_quality || '',
      title_clarity: scoreBreakdown.title_clarity || '',
      evergreen_topic: scoreBreakdown.evergreen_topic || ''
    }
  };
}

async function scoreVideo(video) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
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

    try {
      const parsed = JSON.parse(text);
      const ageBonus = getAgeBonus(video.published_at);

      return normalizeScoreResult(parsed, ageBonus);
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

async function scoreAllVideos() {
  const videos = db.prepare('SELECT * FROM videos ORDER BY published_at ASC').all();
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
  scoreAllVideos,
  scoreVideo
};
