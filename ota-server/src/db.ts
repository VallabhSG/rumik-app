import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export function initDb(db: Database.Database): void {
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
  CREATE INDEX IF NOT EXISTS idx_crash_rates_lookup ON crash_rates(version, channel, recorded_at DESC);

  CREATE TABLE IF NOT EXISTS feature_flags (
    id          TEXT PRIMARY KEY,
    key         TEXT NOT NULL UNIQUE,
    enabled     INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    targeting   TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS experiments (
    id         TEXT PRIMARY KEY,
    key        TEXT NOT NULL UNIQUE,
    status     TEXT NOT NULL DEFAULT 'draft',
    variants   TEXT NOT NULL,
    targeting  TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dynamic_urls (
    id         TEXT PRIMARY KEY,
    key        TEXT NOT NULL UNIQUE,
    value      TEXT NOT NULL,
    targeting  TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kill_switches (
    id         TEXT PRIMARY KEY,
    key        TEXT NOT NULL UNIQUE,
    active     INTEGER NOT NULL DEFAULT 0,
    reason     TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    action      TEXT NOT NULL,
    changes     TEXT,
    actor       TEXT NOT NULL DEFAULT 'api',
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS experiment_assignments (
    install_id    TEXT NOT NULL,
    experiment_id TEXT NOT NULL,
    variant_id    TEXT NOT NULL,
    assigned_at   TEXT NOT NULL,
    PRIMARY KEY (install_id, experiment_id)
  );

  -- Part D: Performance Metrics
  CREATE TABLE IF NOT EXISTS perf_metrics (
    id          TEXT PRIMARY KEY,
    device_id   TEXT NOT NULL,
    version     TEXT NOT NULL,
    channel     TEXT NOT NULL DEFAULT 'production',
    platform    TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    value       REAL NOT NULL,
    session_id  TEXT,
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_perf_version  ON perf_metrics(version, metric_type);
  CREATE INDEX IF NOT EXISTS idx_perf_recorded ON perf_metrics(recorded_at);

  -- Part D: Update Lifecycle Events (adoption funnel)
  CREATE TABLE IF NOT EXISTS update_events (
    id          TEXT PRIMARY KEY,
    device_id   TEXT NOT NULL,
    release_id  TEXT NOT NULL,
    version     TEXT NOT NULL,
    channel     TEXT NOT NULL,
    platform    TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    error_msg   TEXT,
    metadata    TEXT,
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_release  ON update_events(release_id, event_type);
  CREATE INDEX IF NOT EXISTS idx_events_device   ON update_events(device_id);
  CREATE INDEX IF NOT EXISTS idx_events_recorded ON update_events(recorded_at);

  -- Part D: Alert Rules
  CREATE TABLE IF NOT EXISTS alert_rules (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    metric        TEXT NOT NULL,
    operator      TEXT NOT NULL,
    threshold     REAL NOT NULL,
    channel       TEXT DEFAULT 'production',
    version       TEXT,
    window_mins   INTEGER DEFAULT 60,
    cooldown_mins INTEGER DEFAULT 30,
    enabled       INTEGER DEFAULT 1,
    webhook_url   TEXT NOT NULL,
    notifier_type TEXT NOT NULL DEFAULT 'webhook',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );

  -- Part D: Alert History
  CREATE TABLE IF NOT EXISTS alert_history (
    id           TEXT PRIMARY KEY,
    rule_id      TEXT NOT NULL,
    metric_value REAL NOT NULL,
    fired_at     TEXT NOT NULL,
    payload      TEXT NOT NULL,
    status       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_alert_history_rule ON alert_history(rule_id, fired_at);

  -- Part D: Error Groups (deduplication by fingerprint)
  CREATE TABLE IF NOT EXISTS error_groups (
    id          TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    error_type  TEXT NOT NULL,
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    event_count INTEGER DEFAULT 1,
    device_count INTEGER DEFAULT 1,
    version     TEXT NOT NULL,
    channel     TEXT NOT NULL,
    status      TEXT DEFAULT 'open',
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_error_groups_fp     ON error_groups(fingerprint);
  CREATE INDEX IF NOT EXISTS idx_error_groups_status ON error_groups(status, last_seen);

  -- Part D: Error Events (individual occurrences)
  CREATE TABLE IF NOT EXISTS error_events (
    id          TEXT PRIMARY KEY,
    group_id    TEXT NOT NULL,
    device_id   TEXT NOT NULL,
    version     TEXT NOT NULL,
    platform    TEXT NOT NULL,
    error_type  TEXT NOT NULL,
    message     TEXT NOT NULL,
    stack_trace TEXT NOT NULL,
    context     TEXT,
    recorded_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_error_events_group    ON error_events(group_id, recorded_at);
  CREATE INDEX IF NOT EXISTS idx_error_events_recorded ON error_events(recorded_at);

  -- Part C: Audience Segments
  CREATE TABLE IF NOT EXISTS segments (
    id          TEXT PRIMARY KEY,
    key         TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    rules       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  -- Part C: Experiment Exposures (one row per device per experiment)
  CREATE TABLE IF NOT EXISTS experiment_exposures (
    id            TEXT PRIMARY KEY,
    experiment_id TEXT NOT NULL,
    install_id    TEXT NOT NULL,
    user_id       TEXT,
    variant_id    TEXT NOT NULL,
    exposed_at    TEXT NOT NULL,
    UNIQUE (experiment_id, install_id)
  );
  CREATE INDEX IF NOT EXISTS idx_exposures_exp ON experiment_exposures(experiment_id);

  -- Part C: Experiment Conversions
  CREATE TABLE IF NOT EXISTS experiment_conversions (
    id            TEXT PRIMARY KEY,
    experiment_id TEXT NOT NULL,
    install_id    TEXT NOT NULL,
    user_id       TEXT,
    variant_id    TEXT NOT NULL,
    event_name    TEXT NOT NULL,
    value         REAL DEFAULT 1,
    converted_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_conversions_exp ON experiment_conversions(experiment_id, event_name);

  -- Part C: Flag / Experiment Schedules
  CREATE TABLE IF NOT EXISTS flag_schedules (
    id           TEXT PRIMARY KEY,
    entity_type  TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    action       TEXT NOT NULL,
    payload      TEXT,
    scheduled_at TEXT NOT NULL,
    executed_at  TEXT,
    created_by   TEXT NOT NULL DEFAULT 'system',
    created_at   TEXT NOT NULL
  );
`);

  // Migration: add rollout_advanced_at to existing DBs that predate this column
  const cols = (db.prepare("PRAGMA table_info(releases)").all() as Array<{ name: string }>)
    .map(c => c.name);
  if (!cols.includes('rollout_advanced_at')) {
    db.exec('ALTER TABLE releases ADD COLUMN rollout_advanced_at TEXT');
  }

  // Migration: add notifier_type to alert_rules if missing
  const alertCols = (db.prepare("PRAGMA table_info(alert_rules)").all() as Array<{ name: string }>)
    .map(c => c.name);
  if (!alertCols.includes('notifier_type')) {
    db.exec("ALTER TABLE alert_rules ADD COLUMN notifier_type TEXT NOT NULL DEFAULT 'webhook'");
  }

  // Migration: add targeting column to kill_switches if not present
  const ksColumns = db.prepare("PRAGMA table_info(kill_switches)").all() as { name: string }[];
  if (!ksColumns.some(c => c.name === 'targeting')) {
    db.exec(`ALTER TABLE kill_switches ADD COLUMN targeting TEXT`);
  }
  // Migration: add percentage column to kill_switches (default 100 = affects all users)
  if (!ksColumns.some(c => c.name === 'percentage')) {
    db.exec(`ALTER TABLE kill_switches ADD COLUMN percentage INTEGER NOT NULL DEFAULT 100`);
  }
}

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.cwd(), process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'ota.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
initDb(db);

export default db;
