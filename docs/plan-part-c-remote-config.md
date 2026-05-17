# Part C — Remote Configuration System: Implementation Plan

## Architecture Overview

Extends the existing OTA server (`ota-server/`) with 6 new DB tables, new API routes, a WebSocket
layer for kill switches, and a client-side `ConfigClient` that mirrors the `OtaClient` pattern.
Reuses DJB2 bucketing, bearer auth, and SQLite/better-sqlite3.

---

## Phase 1 — Database & Core Services

### Files to create/modify

| File | Action | Purpose |
|------|--------|---------|
| `ota-server/src/db.ts` | MODIFY | Add 6 new tables + migration guards |
| `src/utils/hash.ts` | CREATE | Extract DJB2 to shared utility |
| `src/services/ota/rollout.ts` | MODIFY | Import DJB2 from shared util |
| `ota-server/src/services/audit.ts` | CREATE | Audit logging service |
| `ota-server/src/services/targeting.ts` | CREATE | User targeting engine |

### New DB tables

```sql
-- Feature flags
CREATE TABLE IF NOT EXISTS feature_flags (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  enabled     INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  targeting   TEXT,          -- JSON: TargetingRule
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- A/B experiments
CREATE TABLE IF NOT EXISTS experiments (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'draft',  -- draft|active|paused|completed
  variants   TEXT NOT NULL,                  -- JSON: [{ id, weight }]
  targeting  TEXT,                           -- JSON: TargetingRule
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Dynamic URLs
CREATE TABLE IF NOT EXISTS dynamic_urls (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL,
  targeting  TEXT,                           -- JSON: TargetingRule
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Kill switches
CREATE TABLE IF NOT EXISTS kill_switches (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  active     INTEGER NOT NULL DEFAULT 0,
  reason     TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,   -- flag|experiment|url|kill_switch
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,   -- created|updated|deleted|activated|deactivated
  changes     TEXT,            -- JSON diff: { field: { old, new } }
  actor       TEXT NOT NULL DEFAULT 'api',
  created_at  TEXT NOT NULL
);

-- Experiment assignments (server-side, stable across weight changes)
CREATE TABLE IF NOT EXISTS experiment_assignments (
  install_id    TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  variant_id    TEXT NOT NULL,
  assigned_at   TEXT NOT NULL,
  PRIMARY KEY (install_id, experiment_id)
);
```

### Targeting JSON shape (shared across flags, experiments, URLs)

```typescript
interface TargetingRule {
  platforms?: ("ios" | "android" | "web")[];
  min_version?: string;    // native version semver (inclusive)
  max_version?: string;    // native version semver (inclusive)
  percentage?: number;     // 0-100, uses DJB2 bucketing
}
```

### Shared DJB2 utility (`src/utils/hash.ts`)

```typescript
export function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// Usage: djb2(installId + entityKey) % 100 < percentage → included
```

`src/services/ota/rollout.ts` and `ota-server/src/services/targeting.ts` both import this.
Note: two separate copies may be needed (client vs server) due to module resolution differences.
Client copy at `src/utils/hash.ts`, server copy at `ota-server/src/utils/hash.ts`.

### Audit service (`ota-server/src/services/audit.ts`)

```typescript
function logChange(
  entityType: "flag" | "experiment" | "url" | "kill_switch",
  entityId: string,
  action: "created" | "updated" | "deleted" | "activated" | "deactivated",
  changes: Record<string, { old: unknown; new: unknown }> | null,
  actor?: string
): void
```

Called inside every CRUD route handler. Inserts into `audit_log` synchronously (SQLite).

### Targeting engine (`ota-server/src/services/targeting.ts`)

```typescript
interface DeviceContext {
  platform: "ios" | "android" | "web";
  nativeVersion: string;
  installId: string;
  entityKey: string;  // used as second input to DJB2 for percentage bucketing
}

function evaluateTargeting(
  rule: TargetingRule | null,
  context: DeviceContext
): boolean
```

Logic:
1. If rule is null → return true (no targeting = everyone)
2. Check `platforms` → if specified, platform must be in list
3. Check `min_version`/`max_version` → uses `isVersionInRange` from semver.ts
4. Check `percentage` → `djb2(installId + entityKey) % 100 < percentage`
5. All checks must pass (AND semantics)

---

## Phase 2 — Admin CRUD Routes

### Files to create

| File | Purpose |
|------|---------|
| `ota-server/src/routes/flags.ts` | Feature flag CRUD |
| `ota-server/src/routes/experiments.ts` | Experiment CRUD |
| `ota-server/src/routes/urls.ts` | Dynamic URL CRUD |
| `ota-server/src/routes/killSwitches.ts` | Kill switch CRUD + activate/deactivate |
| `ota-server/src/routes/auditLog.ts` | Read-only audit log |
| `ota-server/src/index.ts` | MODIFY — register 5 new routers |

### Endpoint pattern (flags as example)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| `GET` | `/api/flags` | — | List all flags |
| `GET` | `/api/flags/:id` | — | Single flag |
| `POST` | `/api/flags` | `{ key, enabled?, description?, targeting? }` | Zod validated |
| `PATCH` | `/api/flags/:id` | Partial of above | Audit logged |
| `DELETE` | `/api/flags/:id` | — | Hard delete + audit |

Same pattern for `/api/experiments`, `/api/urls`.

### Kill switches (extra actions)

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/kill-switches/:id/activate` | Sets active=1, broadcasts WS, audit logs |
| `POST` | `/api/kill-switches/:id/deactivate` | Sets active=0, broadcasts WS, audit logs |

### Audit log

| Method | Path | Query | Notes |
|--------|------|-------|-------|
| `GET` | `/api/audit` | `entity_type`, `entity_id`, `limit`, `offset` | Paginated, read-only |

---

## Phase 3 — Config Endpoint & WebSocket

### Files to create/modify

| File | Action | Purpose |
|------|--------|---------|
| `ota-server/src/routes/config.ts` | CREATE | Big-fetch config endpoint |
| `ota-server/src/ws.ts` | CREATE | WebSocket server |
| `ota-server/src/index.ts` | MODIFY | Attach WS, register config route |

### Config endpoint — `GET /api/config`

**Query params:** `platform`, `native_version`, `install_id`
**Auth:** Bearer token (same `OTA_API_KEY`)

**Response shape:**
```typescript
{
  success: true,
  data: {
    flags: Record<string, boolean>,          // key → evaluated for this device
    experiments: Record<string, string>,      // key → assigned variant_id
    urls: Record<string, string>,             // key → resolved URL
    kill_switches: Record<string, boolean>,   // key → active
    ttl: 300,                                 // seconds
    version: "abc12345"                       // DJB2 hash of response, for change detection
  }
}
```

**Server-side resolution order:**
1. Load all flags → `evaluateTargeting(flag.targeting, deviceCtx)` → enabled AND in targeting
2. Load active experiments → bucket via `djb2(installId + experimentKey) % totalWeight`
   → upsert `experiment_assignments` → return variant ID
3. Load URLs → `evaluateTargeting` → return first matching value (or base value if no targeting)
4. Load kill switches → return `{ key: active }`
5. Compute `version` as `djb2(JSON.stringify(response)).toString(16)`

### WebSocket server (`ota-server/src/ws.ts`)

**Protocol:**
```
Client → Server: { type: "auth", token: "Bearer <key>" }
Server → Client: { type: "authenticated" }          -- or closes with 4401 on failure

Server → Client: { type: "kill_switch", key: "payments", active: true, reason: "..." }
Server → Client: { type: "ping" }
Client → Server: { type: "pong" }
```

**Implementation notes:**
- Uses `ws` library: `new WebSocketServer({ server: httpServer, path: '/ws' })`
- Authenticated map: `Map<ws.WebSocket, boolean>` — only broadcast to authed connections
- Kill switch activate/deactivate in `killSwitches.ts` calls `broadcast(killSwitchEvent)`
- Heartbeat: every 30s server sends ping, drops connection after 2 missed pongs
- `broadcast(message)` exported from `ws.ts`, imported by kill switch route

**New dependency:** `ws@^8.17.0` + `@types/ws@^8.5.10` in `ota-server/package.json`

---

## Phase 4 — Client Services

### Files to create

| File | Purpose |
|------|---------|
| `src/services/config/types.ts` | TypeScript types |
| `src/services/config/storage.ts` | AsyncStorage cache layer |
| `src/services/config/wsClient.ts` | WebSocket connection manager |
| `src/services/config/ConfigClient.ts` | Main client orchestrator |

### Types (`src/services/config/types.ts`)

```typescript
interface RemoteConfig {
  flags: Record<string, boolean>;
  experiments: Record<string, string>;
  urls: Record<string, string>;
  kill_switches: Record<string, boolean>;
  ttl: number;
  version: string;
}

interface ConfigClientOptions {
  serverUrl: string;
  apiKey: string;
  platform: "ios" | "android" | "web";
  nativeVersion: string;
  installId: string;
  ttl?: number;                              // override server TTL (seconds)
  onKillSwitch?: (key: string, active: boolean) => void;
  onConfigUpdate?: (config: RemoteConfig) => void;
}

type ConfigStatus = "loading" | "ready" | "error" | "stale";
```

### Storage (`src/services/config/storage.ts`)

```typescript
const KEYS = {
  CONFIG_CACHE: "config:cache",
  CACHE_TIMESTAMP: "config:cached_at",
};

const configStorage = {
  getCache: async (): Promise<{ config: RemoteConfig; cachedAt: Date } | null>
  setCache: async (config: RemoteConfig): Promise<void>
  clearCache: async (): Promise<void>
}
```

### ConfigClient (`src/services/config/ConfigClient.ts`)

**Constructor:** `new ConfigClient(options: ConfigClientOptions)`

**Public API:**
```typescript
initialize(): Promise<void>           // load cache, fetch fresh, connect WS
getFlag(key: string, defaultValue: boolean): boolean
getExperiment(key: string, defaultVariant: string): string
getUrl(key: string, defaultUrl: string): string
isKillSwitchActive(key: string): boolean
getStatus(): ConfigStatus
refresh(): Promise<void>              // force re-fetch
subscribe(listener: () => void): () => void  // notify on config change
destroy(): void                       // close WS, clear timers
```

**Fetch strategy (stale-while-revalidate):**
1. On `initialize()`: load cache → call all listeners → then fetch fresh in background
2. On fresh fetch success: if `version` differs from cache → update cache → call listeners
3. On fetch failure: keep serving cache, set status to `stale`, log warning
4. Set TTL timer (uses server's `ttl` value) → auto-call `refresh()` on expiry
5. On WebSocket `kill_switch` message: update `config.kill_switches[key]` → call listeners

### WebSocket client (`src/services/config/wsClient.ts`)

```typescript
class WsClient {
  constructor(url: string, token: string, onMessage: (msg: WsMessage) => void)
  connect(): void
  disconnect(): void
}
```

**Reconnect backoff:** 1s → 2s → 4s → 8s → 16s → max 30s (resets on successful auth)
**Web platform:** skip entirely (web clients poll via TTL)
**Auth:** first message after `open` is `{ type: "auth", token }`, disconnect if auth fails

---

## Phase 5 — React Hooks

### Files to create

| File | Purpose |
|------|---------|
| `src/hooks/useRemoteConfig.tsx` | Context provider + `ConfigClient` lifecycle |
| `src/hooks/useFeatureFlag.ts` | `useFeatureFlag(key, defaultValue)` |
| `src/hooks/useExperiment.ts` | `useExperiment(key, defaultVariant)` |
| `src/hooks/useKillSwitch.ts` | `useKillSwitch(key)` |
| `src/hooks/useDynamicUrl.ts` | `useDynamicUrl(key, defaultUrl)` |

### Provider (`src/hooks/useRemoteConfig.tsx`)

```tsx
interface RemoteConfigProviderProps {
  serverUrl: string;
  apiKey: string;
  children: React.ReactNode;
}

export function RemoteConfigProvider({ serverUrl, apiKey, children }: RemoteConfigProviderProps)
export function useRemoteConfigClient(): ConfigClient
```

- Reads `Platform.OS`, `Application.nativeApplicationVersion`, and `getInstallId()` to build options
- Creates `ConfigClient` on mount, calls `initialize()`, calls `destroy()` on unmount
- Stores client in React context
- Uses `useSyncExternalStore` pattern via `client.subscribe()` for change propagation

### Consumer hooks

```typescript
// useFeatureFlag.ts
export function useFeatureFlag(key: string, defaultValue = false): boolean

// useExperiment.ts
export function useExperiment(key: string, defaultVariant: string): string

// useKillSwitch.ts
export function useKillSwitch(key: string): boolean

// useDynamicUrl.ts
export function useDynamicUrl(key: string, defaultUrl: string): string
```

All hooks call `useRemoteConfigClient()` to get the client, then read from it.
Kill switch hook also subscribes to re-render on WebSocket updates.

### Usage in App.tsx

```tsx
<RemoteConfigProvider
  serverUrl={process.env.EXPO_PUBLIC_OTA_SERVER_URL ?? ""}
  apiKey={process.env.EXPO_PUBLIC_OTA_API_KEY ?? ""}
>
  <App />
</RemoteConfigProvider>
```

```tsx
// Inside a component:
const isNewPlayerUI = useFeatureFlag("new_player_ui", false);
const variant = useExperiment("onboarding_flow", "control");
const apiUrl = useDynamicUrl("api_base_url", "https://api.rumik.app");
const isPaymentsDown = useKillSwitch("payments");
```

---

## Phase 6 — Admin Dashboard

### Files to create

| File | Purpose |
|------|---------|
| `ota-server/public/admin/index.html` | Single-page admin UI shell |
| `ota-server/public/admin/app.js` | Vanilla JS — API calls, DOM rendering |
| `ota-server/public/admin/style.css` | Dark-theme styling |
| `ota-server/src/index.ts` | MODIFY — serve `public/` as static files |

### Features

- **Auth gate:** Prompt for API key on first load, stored in `sessionStorage`. All API calls use it as Bearer token.
- **Tabs:** Feature Flags | Experiments | URLs | Kill Switches | Audit Log
- **Feature Flags tab:** Table with key, enabled toggle, edit/delete buttons. Create form.
- **Experiments tab:** Table with key, status, variants. Activate/pause/complete actions. Create form.
- **URLs tab:** Table with key, value, targeting. CRUD.
- **Kill Switches tab:** Table with key, status indicator (red/green), big Activate/Deactivate buttons with confirmation modal.
- **Audit Log tab:** Paginated table, filter by entity type, formatted diff viewer.
- **No build step** — plain `<script>` tags, `fetch()` API, CSS custom properties.

### Static serving in index.ts

```typescript
import path from 'path';
// Before 404 handler:
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
```

---

## Phase 7 — Tests

### Client tests

| File | What it tests |
|------|--------------|
| `src/__tests__/services/config/ConfigClient.test.ts` | Fetch, cache, TTL expiry, stale fallback, version diff detection |
| `src/__tests__/services/config/storage.test.ts` | getCache/setCache/clearCache via mocked AsyncStorage |
| `src/__tests__/services/config/wsClient.test.ts` | Connect, auth exchange, kill_switch message, reconnect backoff |
| `src/__tests__/hooks/useFeatureFlag.test.tsx` | Default value, flag true/false, re-render on update |
| `src/__tests__/hooks/useKillSwitch.test.tsx` | Active/inactive, live WS update triggers re-render |

### Server tests

| File | What it tests |
|------|--------------|
| `ota-server/src/__tests__/routes/flags.test.ts` | CRUD, targeting stored, audit log written |
| `ota-server/src/__tests__/routes/config.test.ts` | Big-fetch resolution, bucketing stability, version hash |
| `ota-server/src/__tests__/services/targeting.test.ts` | Platform filter, version range, percentage bucketing |
| `ota-server/src/__tests__/services/audit.test.ts` | logChange writes correct row |

---

## Implementation Order

```
Phase 1 (DB + services) → Phase 2 (CRUD routes) → Phase 3 (config endpoint + WS)
    ↓                                                      ↓
Phase 4 (client services) ← Phase 5 (React hooks) ← Phase 6 (admin dashboard)
```

Test each phase before moving to the next. Phase 7 tests run alongside each phase.

---

## Dependencies to Add

### ota-server/package.json
```json
{
  "dependencies": {
    "ws": "^8.17.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.10"
  }
}
```

No new client dependencies.

---

## Environment Variables (New)

| Variable | Where set | Default | Purpose |
|----------|-----------|---------|---------|
| `CONFIG_TTL_SECONDS` | Render env | `300` | Server default TTL for config responses |
| `WS_HEARTBEAT_INTERVAL_MS` | Render env | `30000` | WebSocket ping interval |
| `EXPO_PUBLIC_CONFIG_SERVER_URL` | `.env` / Expo | same as OTA_SERVER_URL | Config server URL (same server) |

Client uses same `EXPO_PUBLIC_OTA_API_KEY` — no new secret needed.

---

## Key Design Decisions

1. **Single big-fetch** (`GET /api/config`) — one HTTP round-trip delivers all flags/experiments/URLs/kill-switches atomically. Simpler caching and snapshot consistency.

2. **WebSocket only for kill switches** — kill switches need sub-second propagation (e.g. shut down payments immediately). All other config waits for TTL-based polling refresh.

3. **Server-side targeting resolution** — client sends context (platform, version, installId), server evaluates targeting rules. Client never sees targeting logic, preventing reverse-engineering.

4. **DJB2 reuse for experiment bucketing** — same algorithm as OTA rollout, different seed key. Ensures stable experiment assignment (same device always gets same variant).

5. **Server-side experiment assignments** — once device gets variant A, it stays on A even if experiment weights change. Prevents mid-experiment churn that invalidates analysis.

6. **Stale-while-revalidate** — client serves from cache immediately on startup, fetches fresh in background. No loading state shown to user.

7. **Vanilla admin dashboard** — no React, no build step. Served as static files from same Express server. Fast to iterate, simple to deploy, zero extra dependencies.

8. **Auth reuse** — admin dashboard and config endpoint both use the existing `OTA_API_KEY`. No new secret infrastructure needed.

9. **SQLite migration guards** — same pattern as `rollout_advanced_at`: check `PRAGMA table_info` before `ALTER TABLE` so existing production DBs on Render upgrade gracefully.
