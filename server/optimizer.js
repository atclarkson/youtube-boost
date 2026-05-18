const Anthropic = require('@anthropic-ai/sdk');

const db = require('./db');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const selectVideoById = db.prepare('SELECT * FROM videos WHERE id = ?');

function parseTags(tagsValue) {
  try {
    return JSON.parse(tagsValue || '[]');
  } catch (error) {
    return [];
  }
}

function stripMarkdownFences(rawText) {
  return rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/, '')
    .trim();
}

function buildPrompt(video) {
  let parsedExplanation = null;

  try {
    parsedExplanation = video.score_explanation
      ? JSON.parse(video.score_explanation)
      : null;
  } catch (error) {
    parsedExplanation = null;
  }

  return `
You are writing YouTube metadata ideas for a family travel channel.

Channel context:
Adam and Linds is a family travel YouTube channel. Adam, Lindsay, and their three daughters (Lily, Cora, Harper) travel full-time and worldschool their kids. Core audience is English-speaking: US, UK, Canada, Australia, New Zealand.

If keyword_quality_notes, title_clarity_notes, or ctr_assessment are provided above, use them as direct guidance for what specific problems to fix in the new titles. The score explanation identifies exactly what is wrong — address those specific issues.

Video data:
- Current title: ${JSON.stringify(video.title_current || '')}
- Current description (first 500 chars): ${JSON.stringify((video.description_current || '').slice(0, 500))}
- Published at: ${JSON.stringify(video.published_at || '')}
- Duration seconds: ${JSON.stringify(video.duration_seconds || 0)}
- Tags: ${JSON.stringify(parseTags(video.tags))}
- Audit score reason: ${JSON.stringify(video.audit_score_reason || '')}
- Primary problem: ${JSON.stringify(video.primary_problem || '')}
- Evergreen potential: ${JSON.stringify(video.evergreen_potential || '')}
- Scoring version: ${JSON.stringify(video.scoring_version ?? null)}
${Number(video.scoring_version) === 2 ? `- Keyword score: ${JSON.stringify(video.keyword_score ?? null)}
- Clarity score: ${JSON.stringify(video.clarity_score ?? null)}
- Evergreen score: ${JSON.stringify(video.evergreen_score ?? null)}` : ''}
${parsedExplanation ? `- Keyword quality notes: ${JSON.stringify(parsedExplanation.keyword_quality_notes || '')}
- Title clarity notes: ${JSON.stringify(parsedExplanation.title_clarity_notes || '')}
- CTR assessment: ${JSON.stringify(parsedExplanation.ctr_assessment || '')}` : ''}

Instructions:
- Generate exactly 3 title options.
- For each option provide:
  - title: the suggested title, max 100 characters
  - search_intent: what search query this title targets
  - reasoning: 2 to 3 sentences on why this angle should work for the target audience
  - suggested_description_hook: the first 2 to 3 sentences of a new description opening hook

Title style rules:
- No em dashes
- No "it's not X, it's Y" framing
- No ALL CAPS words unless it's a proper noun
- Casual and natural voice
- Must feel like something a real person wrote, not AI

Return valid JSON only with this exact shape:
{
  "options": [
    {
      "title": "string",
      "search_intent": "string",
      "reasoning": "string",
      "suggested_description_hook": "string"
    },
    {
      "title": "string",
      "search_intent": "string",
      "reasoning": "string",
      "suggested_description_hook": "string"
    },
    {
      "title": "string",
      "search_intent": "string",
      "reasoning": "string",
      "suggested_description_hook": "string"
    }
  ]
}
`.trim();
}

function normalizeOption(option) {
  return {
    title: String(option?.title || '').trim().slice(0, 100),
    search_intent: String(option?.search_intent || '').trim(),
    reasoning: String(option?.reasoning || '').trim(),
    suggested_description_hook: String(option?.suggested_description_hook || '').trim()
  };
}

async function generateOptions(videoId) {
  const video = selectVideoById.get(videoId);

  if (!video) {
    throw new Error('Video not found.');
  }

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
  const cleaned = stripMarkdownFences(text);
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed.options) || parsed.options.length !== 3) {
    throw new Error('Claude did not return exactly 3 options.');
  }

  return parsed.options.map(normalizeOption);
}

module.exports = {
  generateOptions
};
