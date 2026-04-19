# Part D — Monitoring & Alerting: Implementation Plan

> **Status:** Planning complete — ready for implementation  
> **Constraint:** Minimal PRs (user has limited PRs remaining); group by cohesion  
> **Stack:** Node.js + Express + better-sqlite3 (server), React Native + Expo (client), Vanilla JS admin SPA  
> **Charts:** Chart.js via CDN (no build step — compatible with existing admin SPA)  
> **Alerts:** Webhook POST to Slack-compatible URLs (stored in existing config table)  
> **Error tracking:** In-house lightweight tracker (no Sentry — free tier constraint)

---

## Overview

| Phase | Name | PR |
|-------|------|----|
| 1 | Performance Metrics Collection | `feat/perf-metrics` |
| 2 | Adoption Funnel & Update Lifecycle | `feat/adoption-funnel` |
| 3 | Alerting Rules Engine | `feat/alerting-engine` |
| 4 | Error Tracking (In-house) | `feat/error-tracking` |
| 5 | Analytics Dashboards (Charts) | `feat/analytics-dashboards` |

---

## Phase 1 — Performance Metrics Collection

### Goal
Collect client-side performance data (startup time, update download latency, JS frame rate, memory pressure) and expose an aggregation API.

### New DB Table

```sql
CREATE TABLE IF NOT EXISTS perf_metrics (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL,
  version     TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'production',
  platform    TEXT NOT NULL,           -- ios | android | web
  metric_type TEXT NOT NULL,           -- startup_ms | update_download_ms | js_fps | memory_mb | ttfb_ms
  value       REAL NOT NULL,
  session_id  TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_perf_version   ON perf_metrics(version, metric_type);
CREATE INDEX IF NOT EXISTS idx_perf_recorded  ON perf_metrics(recorded_at);
```

### New API Routes

**POST `/api/perf-metrics`** — ingest a batch of metrics (client → server)
```typescript
// Request body
{
  device_id: string,
  version: string,
  channel?: string,          // default 'production'
  platform: 'ios' | 'android' | 'web',
  session_id?: string,
  metrics: Array<{
    metric_type: 'startup_ms' | 'update_download_ms' | 'js_fps' | 'memory_mb' | 'ttfb_ms',
    value: number,
    recorded_at?: string     // ISO8601, default now
  }>
}

// Response 201
{ success: true, data: { inserted: number } }
```

**GET `/api/perf-metrics/summary`** — aggregated P50/P95/P99 per version
```typescript
// Query params: version?, channel?, metric_type?, from?, to?
// Response 200
{
  success: true,
  data: {
    version: string,
    metric_type: string,
    p50: number,
    p95: number,
    p99: number,
    sample_count: number,
    from: string,
    to: string
  }[]
}
```

**GET `/api/perf-metrics/timeseries`** — hourly averages for dashboard charts
```typescript
// Query params: version, metric_type, hours? (default 24)
// Response 200
{
  success: true,
  data: Array<{ bucket: string, avg: number, count: number }>
}
```

### Server Files to Create/Modify

- **CREATE** `ota-server/src/routes/perfMetrics.ts`
- **MODIFY** `ota-server/src/db.ts` — add perf_metrics table migration
- **MODIFY** `ota-server/src/index.ts` — mount `/api/perf-metrics` router

### Client Files to Create/Modify

- **CREATE** `src/services/ota/PerfTracker.ts`
  ```typescript
  // Collects metrics, batches them, flushes every 30s or on app background
  export class PerfTracker {
    private queue: PerfEvent[] = [];
    
    recordStartupTime(ms: number): void
    recordUpdateDownload(ms: number): void
    recordFrameRate(fps: number): void
    recordMemory(mb: number): void
    flush(): Promise<void>  // POST /api/perf-metrics
    
    // Called by AppState listener on 'background'
    onAppBackground(): void
  }
  ```
- **MODIFY** `src/services/ota/OtaClient.ts` — instrument `downloadAndStage()` timing, call `PerfTracker.recordUpdateDownload()`
- **MODIFY** `src/hooks/useOtaUpdate.ts` — create PerfTracker instance, record startup time on mount

### Tests

- **CREATE** `ota-server/src/__tests__/routes/perfMetrics.test.ts`
  - POST batch ingestion (valid, invalid schema, empty batch)
  - GET summary with version filter
  - GET timeseries bucketing logic
- **CREATE** `src/__tests__/services/ota/PerfTracker.test.ts`
  - Queue accumulation, flush on background, deduplication

---

## Phase 2 — Adoption Funnel & Update Lifecycle

### Goal
Track the full update lifecycle per device: `eligible → notified → downloading → staged → applied`. Expose cohort adoption rates over time.

### New DB Table

```sql
CREATE TABLE IF NOT EXISTS update_events (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL,
  release_id  TEXT NOT NULL,
  version     TEXT NOT NULL,
  channel     TEXT NOT NULL,
  platform    TEXT NOT NULL,
  event_type  TEXT NOT NULL,  -- eligible | notified | download_start | download_complete | staged | applied | skipped | failed
  error_msg   TEXT,           -- only for 'failed' events
  metadata    TEXT,           -- JSON: e.g. { download_bytes: 1234, duration_ms: 500 }
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_release   ON update_events(release_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_device    ON update_events(device_id);
CREATE INDEX IF NOT EXISTS idx_events_recorded  ON update_events(recorded_at);
```

### New API Routes

**POST `/api/update-events`** — ingest lifecycle events (client → server)
```typescript
// Request body
{
  device_id: string,
  release_id: string,
  version: string,
  channel?: string,
  platform: string,
  events: Array<{
    event_type: 'eligible' | 'notified' | 'download_start' | 'download_complete' | 'staged' | 'applied' | 'skipped' | 'failed',
    error_msg?: string,
    metadata?: Record<string, unknown>,
    recorded_at?: string
  }>
}

// Response 201
{ success: true, data: { inserted: number } }
```

**GET `/api/update-events/funnel`** — adoption funnel for a release
```typescript
// Query params: release_id OR version, channel?
// Response 200
{
  success: true,
  data: {
    release_id: string,
    version: string,
    funnel: {
      eligible: number,
      notified: number,
      downloading: number,
      staged: number,
      applied: number,
      skipped: number,
      failed: number
    },
    adoption_rate: number,   // applied / eligible (0–1)
    failure_rate: number     // failed / downloading (0–1)
  }
}
```

**GET `/api/update-events/timeseries`** — applied count per hour (adoption velocity)
```typescript
// Query params: release_id, hours? (default 48)
// Response 200
{ success: true, data: Array<{ bucket: string, applied: number, failed: number }> }
```

### Server Files to Create/Modify

- **CREATE** `ota-server/src/routes/updateEvents.ts`
- **MODIFY** `ota-server/src/db.ts` — add update_events table
- **MODIFY** `ota-server/src/index.ts` — mount `/api/update-events`

### Client Files to Create/Modify

- **MODIFY** `src/services/ota/OtaClient.ts`
  - After `checkForUpdate()` returns `available` → POST `eligible` event
  - Before `downloadAndStage()` → POST `download_start`
  - After successful download → POST `download_complete` + `staged`
  - After `applyNow()` is confirmed (next launch detection) → POST `applied`
  - On download error → POST `failed` with error message
- **CREATE** `src/services/ota/EventReporter.ts`
  - Thin wrapper that batches + deduplicates update events, flushes to `/api/update-events`

### Tests

- **CREATE** `ota-server/src/__tests__/routes/updateEvents.test.ts`
  - Funnel aggregation accuracy
  - Timeseries bucketing
  - Deduplication (same device_id + release_id + event_type doesn't double-count in funnel)
- **CREATE** `src/__tests__/services/ota/EventReporter.test.ts`

---

## Phase 3 — Alerting Rules Engine

### Goal
Let operators define threshold rules (e.g. "crash_rate > 10% on production → POST to Slack"). Evaluate rules on a schedule and fire notifications.

### New DB Tables

```sql
CREATE TABLE IF NOT EXISTS alert_rules (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  metric       TEXT NOT NULL,   -- crash_rate | adoption_rate | failure_rate | p95_startup_ms | p95_download_ms
  operator     TEXT NOT NULL,   -- gt | lt | gte | lte
  threshold    REAL NOT NULL,
  channel      TEXT DEFAULT 'production',
  version      TEXT,            -- NULL = all versions
  window_mins  INTEGER DEFAULT 60,   -- evaluation window
  cooldown_mins INTEGER DEFAULT 30,  -- min time between repeat alerts
  enabled      INTEGER DEFAULT 1,
  webhook_url  TEXT NOT NULL,   -- Slack-compatible webhook
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_history (
  id           TEXT PRIMARY KEY,
  rule_id      TEXT NOT NULL REFERENCES alert_rules(id),
  metric_value REAL NOT NULL,
  fired_at     TEXT NOT NULL,
  payload      TEXT NOT NULL,   -- JSON sent to webhook
  status       TEXT NOT NULL    -- sent | failed
);

CREATE INDEX IF NOT EXISTS idx_alert_history_rule ON alert_history(rule_id, fired_at);
```

### New API Routes

**GET `/api/alerts/rules`** — list all alert rules
**POST `/api/alerts/rules`** — create a rule
```typescript
// Request body
{
  name: string,
  metric: 'crash_rate' | 'adoption_rate' | 'failure_rate' | 'p95_startup_ms' | 'p95_download_ms',
  operator: 'gt' | 'lt' | 'gte' | 'lte',
  threshold: number,
  channel?: string,
  version?: string,
  window_mins?: number,      // default 60
  cooldown_mins?: number,    // default 30
  webhook_url: string
}
// Response 201: { success: true, data: AlertRule }
```

**PATCH `/api/alerts/rules/:id`** — update / enable / disable rule  
**DELETE `/api/alerts/rules/:id`** — delete rule  
**GET `/api/alerts/history`** — paginated alert fire history (query: rule_id?, limit?, offset?)

### Alerting Engine Service

**CREATE** `ota-server/src/services/alertEngine.ts`

```typescript
export class AlertEngine {
  // Called by scheduler every 5 minutes
  async evaluate(): Promise<void>

  // For a given rule, compute current metric value in its window
  private async computeMetric(rule: AlertRule): Promise<number>

  // Fire webhook if threshold breached and not in cooldown
  private async maybeFireAlert(rule: AlertRule, value: number): Promise<void>

  // POST Slack-compatible payload
  private async sendWebhook(url: string, payload: SlackPayload): Promise<void>
}
```

**Metric computation logic:**
- `crash_rate`: `SELECT AVG(crash_rate) FROM crash_rates WHERE version=? AND recorded_at > (now - window_mins)`
- `adoption_rate`: from `update_events` funnel for active releases in channel
- `failure_rate`: `failed / (download_start + 1)` from `update_events`
- `p95_startup_ms`: SQLite percentile approximation using ORDER BY + LIMIT/OFFSET on perf_metrics
- `p95_download_ms`: same pattern on `update_download_ms` rows

**Webhook payload (Slack-compatible):**
```json
{
  "text": "🚨 Alert: crash_rate on production exceeded 10%",
  "attachments": [{
    "color": "danger",
    "fields": [
      { "title": "Rule", "value": "Production Crash Rate", "short": true },
      { "title": "Metric", "value": "crash_rate", "short": true },
      { "title": "Current Value", "value": "12.3%", "short": true },
      { "title": "Threshold", "value": "> 10%", "short": true },
      { "title": "Channel", "value": "production", "short": true },
      { "title": "Version", "value": "0.5.0", "short": true }
    ],
    "footer": "rumik-app OTA",
    "ts": 1234567890
  }]
}
```

### MODIFY Rollout Scheduler

**MODIFY** `ota-server/src/services/rolloutScheduler.ts`
- After existing crash-rate check, call `alertEngine.evaluate()` every 5th tick (i.e., every 5 × 30min = every 2.5h, or add a dedicated 5-min interval)
- Better: add a **separate** `setInterval` at server startup for 5-minute alert evaluation

**MODIFY** `ota-server/src/index.ts`
- Import and start AlertEngine interval: `setInterval(() => alertEngine.evaluate(), 5 * 60 * 1000)`

### Server Files to Create/Modify

- **CREATE** `ota-server/src/routes/alerts.ts`
- **CREATE** `ota-server/src/services/alertEngine.ts`
- **MODIFY** `ota-server/src/db.ts` — add alert_rules, alert_history tables
- **MODIFY** `ota-server/src/index.ts` — mount `/api/alerts`, start alert interval

### Tests

- **CREATE** `ota-server/src/__tests__/routes/alerts.test.ts`
  - Rule CRUD, enable/disable
  - History pagination
- **CREATE** `ota-server/src/__tests__/services/alertEngine.test.ts`
  - Metric computation for each metric type
  - Cooldown enforcement (doesn't re-fire within cooldown window)
  - Webhook POST called with correct payload (mock fetch)
  - Failed webhook → recorded as 'failed' in alert_history

---

## Phase 4 — In-House Error Tracking

### Goal
Capture symbolicated JS errors with stack traces, device context, and version info. Deduplicate by fingerprint. Display in admin UI.

### New DB Tables

```sql
CREATE TABLE IF NOT EXISTS error_groups (
  id           TEXT PRIMARY KEY,
  fingerprint  TEXT NOT NULL UNIQUE,  -- hash of (error_type + top 3 stack frames)
  title        TEXT NOT NULL,         -- e.g. "TypeError: Cannot read property 'x' of null"
  error_type   TEXT NOT NULL,
  first_seen   TEXT NOT NULL,
  last_seen    TEXT NOT NULL,
  event_count  INTEGER DEFAULT 1,
  device_count INTEGER DEFAULT 1,
  version      TEXT NOT NULL,         -- version where first seen
  channel      TEXT NOT NULL,
  status       TEXT DEFAULT 'open',   -- open | resolved | ignored
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS error_events (
  id           TEXT PRIMARY KEY,
  group_id     TEXT NOT NULL REFERENCES error_groups(id),
  device_id    TEXT NOT NULL,
  version      TEXT NOT NULL,
  platform     TEXT NOT NULL,
  error_type   TEXT NOT NULL,
  message      TEXT NOT NULL,
  stack_trace  TEXT NOT NULL,         -- full stack as JSON array of frames
  context      TEXT,                  -- JSON: { route, user_action, ota_status }
  recorded_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_error_groups_fingerprint ON error_groups(fingerprint);
CREATE INDEX IF NOT EXISTS idx_error_groups_status      ON error_groups(status, last_seen);
CREATE INDEX IF NOT EXISTS idx_error_events_group       ON error_events(group_id, recorded_at);
```

### New API Routes

**POST `/api/errors`** — ingest error event (client → server)
```typescript
// Request body
{
  device_id: string,
  version: string,
  platform: string,
  error_type: string,
  message: string,
  stack_trace: Array<{ file: string, line: number, column: number, func: string }>,
  context?: { route?: string, user_action?: string, ota_status?: string }
}
// Response 201: { success: true, data: { group_id: string, is_new: boolean } }
```

**GET `/api/errors/groups`** — list error groups
```typescript
// Query params: status?, version?, channel?, limit?, offset?
// Response 200: { success: true, data: ErrorGroup[], meta: { total, page, limit } }
```

**GET `/api/errors/groups/:id`** — group detail + recent events
**PATCH `/api/errors/groups/:id`** — update status (resolve/ignore)

### Fingerprinting Logic (server-side)

```typescript
// In route handler or a service
function computeFingerprint(errorType: string, stackTrace: StackFrame[]): string {
  const topFrames = stackTrace.slice(0, 3)
    .map(f => `${f.file}:${f.func}`)
    .join('|');
  const raw = `${errorType}::${topFrames}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}
```

### Client Files to Create/Modify

- **CREATE** `src/services/ota/ErrorReporter.ts`
  ```typescript
  export class ErrorReporter {
    install(): void  // Sets ErrorUtils.setGlobalHandler
    
    private async report(error: Error, isFatal: boolean): Promise<void>
    // Parses stack, computes basic frame extraction, POST /api/errors
  }
  ```
- **MODIFY** `src/hooks/useOtaUpdate.ts` — instantiate ErrorReporter, call `install()`

### Server Files to Create/Modify

- **CREATE** `ota-server/src/routes/errors.ts`
- **CREATE** `ota-server/src/services/errorGrouper.ts` — fingerprint + upsert group logic
- **MODIFY** `ota-server/src/db.ts` — add error_groups, error_events tables
- **MODIFY** `ota-server/src/index.ts` — mount `/api/errors`

### Tests

- **CREATE** `ota-server/src/__tests__/routes/errors.test.ts`
  - POST groups similar errors by fingerprint
  - POST creates new group for novel error
  - PATCH updates status
- **CREATE** `ota-server/src/__tests__/services/errorGrouper.test.ts`
  - Fingerprint determinism
  - event_count increment on duplicate
  - device_count only increments for new device on same group

---

## Phase 5 — Analytics Dashboards

### Goal
Add rich charts to the admin SPA: time-series crash rate, adoption funnel, performance P95 trends, rollout health, experiment results, error groups.

### Dashboard Additions (admin SPA — vanilla JS + Chart.js)

**ADD** Chart.js CDN to `ota-server/public/admin/index.html`:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
```

#### Tab 1: Monitoring (new tab, replaces current "Metrics")

**Panel A — Crash Rate Trend** (Line chart)
- X-axis: last 24h in hourly buckets
- Y-axis: crash rate %
- Series: per-version (one line per active version)
- Data: `GET /api/crash-rate/history?hours=24` grouped client-side by version

**Panel B — Performance P95 Trend** (Line chart)
- X-axis: last 24h hourly
- Y-axis: milliseconds
- Series: `startup_ms`, `update_download_ms` (two lines)
- Data: `GET /api/perf-metrics/timeseries?metric_type=startup_ms&hours=24`

**Panel C — Active Alerts** (Table + badge)
- Show rules currently in breach (metric value > threshold)
- Red badge on "Monitoring" tab when any alert is active

#### Tab 2: Adoption (new tab)

**Panel A — Update Adoption Funnel** (Horizontal bar / funnel chart)
- Steps: Eligible → Notified → Downloading → Staged → Applied
- Data: `GET /api/update-events/funnel?release_id=<selected>`
- Release selector dropdown (populated from `GET /api/releases`)

**Panel B — Adoption Velocity** (Line chart)
- X-axis: hourly buckets
- Y-axis: cumulative applied count
- Data: `GET /api/update-events/timeseries?release_id=<selected>`

**Panel C — Rollout Health Table**
- Version | Channel | Rollout% | Adoption Rate | Crash Rate | Stage | Status
- Data: join `/api/scheduler` + `/api/update-events/funnel` per release

#### Tab 3: Errors (new tab)

**Panel A — Error Groups Table**
- Columns: Title | Count | Devices | Version | First Seen | Last Seen | Status
- Status filter: open / resolved / ignored
- Click row → expand to show recent 5 events with stack traces
- Data: `GET /api/errors/groups`

**Panel B — Error Rate Chart** (Line)
- X-axis: hourly
- Y-axis: new error events/hour
- Data: query `error_events` grouped by `strftime('%Y-%m-%dT%H:00:00', recorded_at)`
  → add `GET /api/errors/timeseries` endpoint

#### Existing "Metrics" Tab — Enhance

- Keep existing crash rate table
- Add inline sparkline (Chart.js) next to each version row showing 7-day trend

### Files to Create/Modify

- **MODIFY** `ota-server/public/admin/index.html` — add Chart.js CDN, new tab buttons (Monitoring, Adoption, Errors)
- **MODIFY** `ota-server/public/admin/app.js` — add tab render functions for each new tab
- **CREATE** `ota-server/public/admin/charts.js` — Chart.js wrappers (createLineChart, createFunnelChart, createSparkline)
- **MODIFY** `ota-server/public/admin/style.css` — styles for funnel, error table expand, alert badges

### Additional Server Route for Dashboards

**GET `/api/errors/timeseries`**
```typescript
// Query params: hours? (default 24)
// SELECT strftime('%Y-%m-%dT%H:00:00', recorded_at) as bucket, COUNT(*) as count
// FROM error_events WHERE recorded_at > ? GROUP BY bucket ORDER BY bucket
{ success: true, data: Array<{ bucket: string, count: number }> }
```

### Tests (E2E)

- **MODIFY** `e2e/home.spec.ts` or **CREATE** `e2e/admin-dashboard.spec.ts`
  - Monitoring tab renders without JS errors
  - Adoption tab funnel chart loads for a seeded release
  - Errors tab table populates after ingesting a test error

---

## PR Grouping Table

| Phase | PR Branch | Files Touched | Depends On |
|-------|-----------|---------------|------------|
| 1 | `feat/perf-metrics` | `ota-server/src/routes/perfMetrics.ts`, `ota-server/src/db.ts`, `ota-server/src/index.ts`, `src/services/ota/PerfTracker.ts`, `src/hooks/useOtaUpdate.ts`, tests | — |
| 2 | `feat/adoption-funnel` | `ota-server/src/routes/updateEvents.ts`, `ota-server/src/db.ts`, `ota-server/src/index.ts`, `src/services/ota/OtaClient.ts`, `src/services/ota/EventReporter.ts`, tests | Phase 1 (DB) |
| 3 | `feat/alerting-engine` | `ota-server/src/routes/alerts.ts`, `ota-server/src/services/alertEngine.ts`, `ota-server/src/db.ts`, `ota-server/src/index.ts`, tests | Phase 1+2 |
| 4 | `feat/error-tracking` | `ota-server/src/routes/errors.ts`, `ota-server/src/services/errorGrouper.ts`, `ota-server/src/db.ts`, `src/services/ota/ErrorReporter.ts`, tests | — (independent) |
| 5 | `feat/analytics-dashboards` | `ota-server/public/admin/index.html`, `ota-server/public/admin/app.js`, `ota-server/public/admin/charts.js`, `ota-server/public/admin/style.css`, `e2e/admin-dashboard.spec.ts` | All phases |

> **Merge order:** 1 → 4 (parallel after 1 DB) → 2 → 3 → 5

---

## Implementation Notes

### SQLite Percentile (P95) Approximation

SQLite has no native PERCENTILE function. Use:
```sql
SELECT value FROM perf_metrics
WHERE metric_type = ? AND version = ? AND recorded_at > ?
ORDER BY value ASC
LIMIT 1 OFFSET CAST(COUNT(*) * 0.95 AS INTEGER)
```
In practice, use a subquery for COUNT:
```sql
WITH ranked AS (
  SELECT value, ROW_NUMBER() OVER (ORDER BY value) as rn, COUNT(*) OVER () as total
  FROM perf_metrics
  WHERE metric_type = ? AND version = ? AND recorded_at > ?
)
SELECT value FROM ranked WHERE rn = CAST(total * 0.95 AS INTEGER) + 1
```

### Render Free Tier — Ephemeral SQLite

All new tables follow the existing pattern in `db.ts`: `CREATE TABLE IF NOT EXISTS` in the migration block that runs at server startup. Tables are recreated empty on each redeploy. This is acceptable for monitoring data in demo/dev; document it as a known limitation.

### Auth

All new routes use the existing Bearer token middleware (already applied globally in `index.ts` via `authenticate` middleware) — no additional auth work needed.

### Rate Limiting on Ingest Routes

Add basic rate limiting on client-facing ingest routes (`/api/perf-metrics`, `/api/update-events`, `/api/errors`) to prevent abuse:
```typescript
// In each route file, use a simple token-bucket per device_id in memory
// Or use the existing pattern: validate device_id presence and 400 on missing
```
For the free tier, an in-memory Map<deviceId, lastFlushTime> guard (min 10s between same-device posts) is sufficient.

---

## Dashboard Wireframe Summary

```
[Monitoring] [Adoption] [Errors] [Releases] [Flags] [Experiments] [URLs] [Kill Switches] [Audit]

── Monitoring Tab ──────────────────────────────────────────────────────
 Crash Rate (24h)           │  Performance P95 (24h)
 [Line chart - per version] │  [Line chart - startup/download ms]
─────────────────────────────────────────────────────────────────────────
 🔴 Active Alerts: 2
 [crash_rate > 10% on production — current: 12.3% — fired 5min ago]
 [p95_startup_ms > 3000 on staging — current: 3120ms — fired 12min ago]
─────────────────────────────────────────────────────────────────────────
 Alert Rules                                          [+ Add Rule]
 [Table: name | metric | threshold | channel | status | last fired]

── Adoption Tab ─────────────────────────────────────────────────────────
 Release: [v0.5.0 - production ▼]
 Adoption Funnel
 ████████████████████ Eligible    1,200
 ████████████████     Notified    1,050  (87.5%)
 ████████████         Downloading   800  (66.7%)
 ████████             Staged        750  (62.5%)
 ████████             Applied       720  (60.0%)
─────────────────────────────────────────────────────────────────────────
 Adoption Velocity (applied/hour) [Line chart]
─────────────────────────────────────────────────────────────────────────
 Rollout Health
 [v0.5.0 | production | 100% | 60.0% adopted | 0.8% crash | Stage 4 | active]

── Errors Tab ───────────────────────────────────────────────────────────
 [open ▼]  [Filter by version ▼]
 Title                                      Count  Devices  Last Seen  Status
 TypeError: Cannot read property 'x'…         23       8    2min ago   open  ▼
   └ stack: OtaClient.ts:42 | HomeScreen.tsx:18 | App.tsx:5
   └ [Show 5 recent events]
```

---

*Plan created: 2026-04-19. Implement in phase order. Start with Phase 1 (`feat/perf-metrics`) on branch `fix/ota-asyncstorage-resilience` or a fresh feature branch.*
