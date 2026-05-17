# youtube-boost

A locally-run YouTube channel optimization tool for content creators. Audits your back catalog, uses AI to suggest better titles and descriptions for older videos, monitors performance for 30 days, and advises whether to keep, tweak, or revert each change.

Built for the **Adam and Linds** YouTube channel. Designed to be expandable to other growth and optimization workflows over time.

---

## What It Does

1. **Syncs** all videos from your YouTube channel via the YouTube Data API
2. **Scores** every video for reoptimization potential — older content ranks higher as a candidate
3. **Generates** 3 AI-powered title options per video with reasoning on why each should work
4. **Applies** approved changes directly to YouTube (nothing goes live without your explicit approval)
5. **Monitors** each optimized video for 30 days — views, watch time, search traffic, and English-speaking geo breakdown (US, GB, CA, AU, NZ)
6. **Advises** at day 30: keep the new title, try a different angle, or revert

---

## Prime Directive

**Everything stays within YouTube and Google Terms of Service.** All metadata changes go through the official YouTube Data API. No scraping. No automation without explicit user approval. Full audit trail maintained and every change is reversible.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Backend | Express.js |
| Frontend | React 18 + Vite |
| Database | SQLite (better-sqlite3) |
| AI | Anthropic Claude API |
| YouTube | YouTube Data API v3 + Analytics API v3 |
| Auth | Google OAuth 2.0 |
| Charts | Recharts |
| Scheduler | node-cron |

---

## Project Structure

```
youtube-boost/
├── server/
│   ├── index.js          # Express entry point
│   ├── db.js             # SQLite init and migrations
│   ├── auth.js           # Google OAuth flow
│   ├── youtube.js        # YouTube Data API calls
│   ├── analytics.js      # YouTube Analytics API calls
│   ├── scoring.js        # Claude-powered audit scoring
│   ├── optimizer.js      # Claude title/description generation
│   ├── monitor.js        # Daily snapshot cron job
│   └── routes/
│       ├── auth.js
│       ├── videos.js
│       ├── optimizations.js
│       ├── monitoring.js
│       └── verdicts.js
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
├── data/                 # SQLite DB lives here (gitignored)
├── .env                  # Local secrets (gitignored)
├── .env.example          # Template
├── AGENTS.md             # Instructions for AI coding agents
└── README.md
```

---

## Phases

### Phase 1 — Scaffold & Auth
Project structure, SQLite schema, Google OAuth 2.0 flow, YouTube API connection test, shell React UI with routing.

### Phase 2 — Video Sync & Audit
Pull all channel videos, store in SQLite, Claude scores each video for reoptimization potential with visible score breakdown.

### Phase 3 — Daily Batch & Optimization
Batch screen showing top candidates, Claude generates 3 title options with reasoning, approval flow, applies to YouTube via API. Warning shown if daily approvals exceed 5.

### Phase 4 — Monitoring
Daily cron job snapshots Analytics data per optimized video, before/after charts, geo and search traffic breakdown.

### Phase 5 — Verdicts & History
30-day AI verdict per video (keep/tweak/revert), full edit history, revert to original at any time.

---

## Setup

### Prerequisites
- Node.js 20+
- A Google Cloud project with YouTube Data API v3 and YouTube Analytics API v3 enabled
- OAuth 2.0 credentials (Desktop or Web application type)
- Anthropic API key

### Install

```bash
git clone https://github.com/atclarkson/youtube-boost.git
cd youtube-boost
npm install
cd client && npm install && cd ..
```

### Configure

```bash
cp .env.example .env
# Fill in your keys
```

### Run

```bash
npm run dev
```

App runs at `http://localhost:3005`

---

## Daily Limit Advisory

There is no hard cap on daily approvals. However, the app will display a warning once you approve more than 5 optimizations in a single day. YouTube re-indexes all updated videos simultaneously, which can cause temporary ranking dips before improvements appear. Proceed beyond 5 with awareness.

---

## Monitoring Scope

After each optimization is applied, the app tracks daily for 30 days:

- Total views and watch time
- Impressions and CTR
- Search traffic source (views + watch time)
- Geographic breakdown: United States, United Kingdom, Canada, Australia, New Zealand

---

## License

Private. Not for public distribution.