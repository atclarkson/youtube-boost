# AGENTS.md

Instructions for AI coding agents (Codex, Claude, etc.) working on this codebase.

---

## Project Overview

`youtube-boost` is a locally-run Node.js/Express/React application that helps a YouTube content creator audit their back catalog, generate AI-optimized titles and descriptions for older videos, apply approved changes via the YouTube Data API, and monitor performance for 30 days.

The owner is a solo developer/content creator. Code should be practical, readable, and not over-engineered.

---

## Prime Directive

**Never suggest, generate, or implement anything that violates YouTube or Google Terms of Service.**

This means:

- All YouTube metadata changes must go through the official YouTube Data API v3
- No web scraping of YouTube
- No automation that applies changes without explicit user approval
- No keyword stuffing or other manipulative SEO practices
- No fake engagement, view inflation, or click manipulation of any kind
- Every change must be logged and reversible

If a task would require violating ToS to implement, say so clearly and suggest a compliant alternative.

---

## Tech Stack

| Layer     | Technology               | Notes                                         |
| --------- | ------------------------ | --------------------------------------------- |
| Runtime   | Node.js 20+              |                                               |
| Backend   | Express.js               | Port 3005                                     |
| Frontend  | React 18 + Vite          |                                               |
| Database  | SQLite                   | via better-sqlite3, synchronous API preferred |
| AI        | Anthropic Claude API     | Model: claude-sonnet-4-5                      |
| YouTube   | YouTube Data API v3      | video list, update                            |
| Analytics | YouTube Analytics API v3 | reports endpoint                              |
| Auth      | Google OAuth 2.0         | token stored in .env or local token file      |
| Charts    | Recharts                 |                                               |
| Scheduler | node-cron                | daily snapshot job                            |
| HTTP      | Axios                    | frontend API calls                            |
| Dev       | Concurrently             | boots server + client together                |

---

## Project Structure

```
youtube-boost/
├── server/
│   ├── index.js              # Express entry point, middleware, route mounting
│   ├── db.js                 # SQLite init, schema creation, migrations
│   ├── auth.js               # Google OAuth helpers, token management
│   ├── youtube.js            # YouTube Data API wrapper functions
│   ├── analytics.js          # YouTube Analytics API wrapper functions
│   ├── scoring.js            # Claude-powered audit scoring logic
│   ├── optimizer.js          # Claude title/description generation
│   ├── monitor.js            # Daily snapshot cron job
│   └── routes/
│       ├── auth.js           # /api/auth/*
│       ├── videos.js         # /api/videos/*
│       ├── optimizations.js  # /api/optimizations/*
│       ├── monitoring.js     # /api/monitoring/*
│       └── verdicts.js       # /api/verdicts/*
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Audit.jsx
│   │   │   ├── DailyBatch.jsx
│   │   │   ├── Monitoring.jsx
│   │   │   └── History.jsx
│   │   └── components/
├── data/                     # gitignored, SQLite DB file lives here
├── .env                      # gitignored, secrets
├── .env.example              # committed, no real values
├── AGENTS.md                 # this file
└── README.md
```

---

## Database Schema

### `videos`

```sql
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id TEXT UNIQUE NOT NULL,
  title_original TEXT,
  title_current TEXT,
  description_original TEXT,
  description_current TEXT,
  published_at TEXT,
  duration_seconds INTEGER,
  category_id TEXT,
  tags TEXT,                        -- JSON array as string
  audit_score REAL,
  audit_score_breakdown TEXT,       -- JSON object as string
  audit_score_reason TEXT,
  evergreen_potential TEXT,
  primary_problem TEXT,
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### `optimizations`

```sql
CREATE TABLE IF NOT EXISTS optimizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER REFERENCES videos(id),
  status TEXT DEFAULT 'pending',    -- pending | approved | applied | reverted
  title_option_1 TEXT,
  title_option_1_reasoning TEXT,
  title_option_2 TEXT,
  title_option_2_reasoning TEXT,
  title_option_3 TEXT,
  title_option_3_reasoning TEXT,
  chosen_title TEXT,
  chosen_description TEXT,
  applied_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### `monitoring_snapshots`

```sql
CREATE TABLE IF NOT EXISTS monitoring_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER REFERENCES videos(id),
  optimization_id INTEGER REFERENCES optimizations(id),
  snapshot_date TEXT,
  views INTEGER,
  watch_time_minutes REAL,
  impressions INTEGER,
  ctr REAL,
  search_views INTEGER,
  search_watch_time REAL,
  views_us INTEGER,
  views_gb INTEGER,
  views_ca INTEGER,
  views_au INTEGER,
  views_nz INTEGER,
  avg_view_duration REAL
);
```

### `ai_verdicts`

```sql
CREATE TABLE IF NOT EXISTS ai_verdicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER REFERENCES videos(id),
  optimization_id INTEGER REFERENCES optimizations(id),
  verdict_date TEXT,
  verdict TEXT,                     -- keep | tweak | revert
  reasoning TEXT,
  confidence_score REAL
);
```

### `daily_log`

```sql
CREATE TABLE IF NOT EXISTS daily_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_date TEXT,
  approvals_count INTEGER DEFAULT 0,
  video_ids_approved TEXT,          -- JSON array as string
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## Key Behaviors

### Video Scoring

- All videos are pulled regardless of age
- Age is a **multiplier** on the score — older videos rank significantly higher as candidates
- Score components: age weight, CTR gap vs channel average, impression volume, evergreen topic potential, watch time retention
- Score breakdown must be stored as JSON and displayed in the UI per video
- `audit_score_breakdown` must include: `internal_score` (1-100), `content_type`, `era`, `relative_performance_note`, `base_score`, `age_bonus`, `final_score`, `ctr_assessment`, `keyword_quality`, `title_clarity`, `evergreen_topic`

### Daily Batch

- No hard daily limit on approvals
- UI must show a warning banner when approvals in the current calendar day exceed 5
- Warning text: "You've approved X optimizations today. Applying too many at once can cause temporary ranking dips as YouTube re-indexes everything simultaneously."
- Warning does not block further approvals

### Title Generation

- Claude always returns exactly 3 title options per video
- Each option includes: the title, a target search intent, and reasoning for why it should work for English-speaking audiences
- User must explicitly choose one (or edit it) before anything is applied to YouTube

### Monitoring

- Snapshots pulled daily for 30 days after an optimization is applied
- Geo breakdown tracks: US, GB, CA, AU, NZ specifically
- Search traffic source isolated from total views
- Impressions and CTR are **not** available via the YouTube Analytics API in this app's query model and must never be requested as metrics
- At day 30, Claude receives full before/after dataset and returns a verdict

### Revert

- Original title and description always stored in `videos.title_original` and `videos.description_original`
- Revert button available at any time in History view
- Revert applies original values back via YouTube Data API and logs the action

---

## Environment Variables

```
YOUTUBE_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3005/api/auth/callback
ANTHROPIC_API_KEY=
```

---

## Code Style

- Async/await throughout, no raw Promise chains
- Error handling on all API calls — log errors, return meaningful messages to the frontend
- No TypeScript — plain JavaScript only
- Comments on anything non-obvious
- Keep route handlers thin — business logic lives in the service files (youtube.js, analytics.js, scoring.js, etc.)
- SQLite calls use synchronous better-sqlite3 API (no async needed)

---

## UI Conventions

- Always use Tailwind CSS for styling. Never write raw CSS.
- Audit table column headers must be sortable (click to sort asc/desc)
- Audit page must have a content type filter: Shorts (under 180 seconds), Long Form (180 seconds and over), Both — this filters the displayed rows
- All tables in the app should follow this sortable pattern

---

## What NOT To Build

- No multi-user support
- No public-facing endpoints
- No thumbnail modification (YouTube API does not support it cleanly)
- No auto-applying changes without user approval
- No email or push notifications — in-app only
- No TypeScript migration
- No Docker setup
