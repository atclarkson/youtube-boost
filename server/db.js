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
  privacy_status TEXT,
  tags TEXT,                        -- JSON array as string
  audit_score REAL,
  audit_score_breakdown TEXT,       -- JSON object as string
  audit_score_reason TEXT,
  evergreen_potential TEXT,
  primary_problem TEXT,
  hidden INTEGER DEFAULT 0,
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
  avg_view_duration REAL,
  avg_view_percentage REAL,
  watch_time_us REAL,
  watch_time_gb REAL,
  watch_time_ca REAL,
  watch_time_au REAL,
  watch_time_nz REAL,
  estimated_revenue REAL,
  cpm REAL,
  monetized_playbacks INTEGER,
  subscribers_gained INTEGER
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
  db.exec('ALTER TABLE videos ADD COLUMN privacy_status TEXT');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE videos ADD COLUMN hidden INTEGER DEFAULT 0');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE videos ADD COLUMN scoring_version INTEGER DEFAULT 1');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE videos ADD COLUMN keyword_score REAL');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE videos ADD COLUMN clarity_score REAL');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE videos ADD COLUMN evergreen_score REAL');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE videos ADD COLUMN score_explanation TEXT');
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

try {
  db.exec('ALTER TABLE monitoring_snapshots ADD COLUMN estimated_revenue REAL');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE monitoring_snapshots ADD COLUMN cpm REAL');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE monitoring_snapshots ADD COLUMN monetized_playbacks INTEGER');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

try {
  db.exec('ALTER TABLE monitoring_snapshots ADD COLUMN subscribers_gained INTEGER');
} catch (error) {
  // Ignore duplicate-column errors so existing databases keep booting cleanly.
}

db.exec(`
  UPDATE monitoring_snapshots
  SET snapshot_date = date(snapshot_date, '-1 day')
  WHERE id IN (
    SELECT ms.id
    FROM monitoring_snapshots ms
    INNER JOIN optimizations o ON o.id = ms.optimization_id
    WHERE ms.snapshot_date = date(substr(o.applied_at, 1, 10), '+1 day')
  )
`);

module.exports = db;
