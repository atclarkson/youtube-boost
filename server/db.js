const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'youtube-boost.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

db.exec(`
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

CREATE TABLE IF NOT EXISTS baseline_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER REFERENCES videos(id),
  youtube_id TEXT,
  captured_at TEXT,
  views INTEGER,
  watch_time_minutes REAL,
  avg_view_duration REAL,
  avg_view_percentage REAL,
  search_views INTEGER,
  search_watch_time REAL,
  views_us INTEGER,
  views_gb INTEGER,
  views_ca INTEGER,
  views_au INTEGER,
  views_nz INTEGER,
  watch_time_us REAL,
  watch_time_gb REAL,
  watch_time_ca REAL,
  watch_time_au REAL,
  watch_time_nz REAL
);

CREATE TABLE IF NOT EXISTS ai_verdicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER REFERENCES videos(id),
  optimization_id INTEGER REFERENCES optimizations(id),
  verdict_date TEXT,
  verdict TEXT,                     -- keep | tweak | revert
  reasoning TEXT,
  confidence_score REAL
);

CREATE TABLE IF NOT EXISTS daily_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_date TEXT,
  approvals_count INTEGER DEFAULT 0,
  video_ids_approved TEXT,          -- JSON array as string
  created_at TEXT DEFAULT (datetime('now'))
);
`);

try {
  db.exec('ALTER TABLE videos ADD COLUMN view_count INTEGER');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE monitoring_snapshots ADD COLUMN avg_view_percentage REAL');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE monitoring_snapshots ADD COLUMN watch_time_us REAL');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE monitoring_snapshots ADD COLUMN watch_time_gb REAL');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE monitoring_snapshots ADD COLUMN watch_time_ca REAL');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE monitoring_snapshots ADD COLUMN watch_time_au REAL');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE monitoring_snapshots ADD COLUMN watch_time_nz REAL');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

module.exports = db;
