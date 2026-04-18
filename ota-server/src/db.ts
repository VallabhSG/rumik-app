import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.cwd(), process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'ota.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS releases (
    id                  TEXT PRIMARY KEY,
    version             TEXT NOT NULL,
    channel             TEXT NOT NULL DEFAULT 'production',
    platform            TEXT NOT NULL DEFAULT 'all',
    rollout_percentage  REAL NOT NULL DEFAULT 0,
    is_rollback         INTEGER NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'active',
    commit_sha          TEXT,
    min_native_version  TEXT,
    max_native_version  TEXT,
    release_notes       TEXT,
    metadata            TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    rollout_advanced_at TEXT
  );

  CREATE TABLE IF NOT EXISTS rollbacks (
    id             TEXT PRIMARY KEY,
    target_version TEXT NOT NULL,
    from_version   TEXT,
    reason         TEXT NOT NULL,
    channels       TEXT NOT NULL,
    triggered_by   TEXT NOT NULL DEFAULT 'system',
    status         TEXT NOT NULL DEFAULT 'completed',
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS crash_rates (
    id          TEXT PRIMARY KEY,
    crash_rate  REAL NOT NULL DEFAULT 0,
    version     TEXT,
    channel     TEXT,
    recorded_at TEXT NOT NULL
  );
`);

// Migration: add rollout_advanced_at to existing DBs that predate this column
const cols = (db.prepare("PRAGMA table_info(releases)").all() as Array<{ name: string }>)
  .map(c => c.name);
if (!cols.includes('rollout_advanced_at')) {
  db.exec('ALTER TABLE releases ADD COLUMN rollout_advanced_at TEXT');
}

export default db;
