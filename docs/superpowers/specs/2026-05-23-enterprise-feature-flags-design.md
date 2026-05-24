# Enterprise Feature Flags, Experiments & Kill Switches — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate the rumik OTA/config system to full enterprise-grade — user identity targeting, named segments, real feature flags controlling actual UI/behavior, real A/B experiments with exposure and conversion tracking, kill switch platform targeting, scheduled flag changes, and actor identity in the audit log.

**Architecture:** Server-side evaluation extended to accept Clerk userId + user attributes alongside device context. Named segments stored in DB, reused across flags/experiments/kill switches. Experiment metrics collected via fire-and-forget POST from the client, aggregated into a results endpoint. Scheduling piggybacks on the existing rolloutScheduler tick.

**Tech Stack:** Express + better-sqlite3 (OTA server), React Native + Expo (client), Clerk (user identity), expo-file-system (offline), expo-web-browser (lyrics), React Native Share API (social share)

---

## Section 1 — Extended Targeting Schema

### Server: `TargetingRule` (ota-server/src/services/targeting.ts)

```typescript
interface AttributeRule {
  attribute: 'plan' | 'email_domain' | 'account_age_days';
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'in';
  value: string | number | string[];
}

interface TargetingRule {
  // existing
  platforms?: ('ios' | 'android' | 'web')[];
  min_version?: string;
  max_version?: string;
  percentage?: number;
  // NEW
  user_ids?: string[];
  segment_keys?: string[];
  user_attribute_rules?: AttributeRule[];
}

interface UserContext {
  userId?: string;
  plan?: string;
  email_domain?: string;
  account_age_days?: number;
}
```

### Evaluation order (all criteria AND'd):
1. `platforms` match
2. `min/max_version` in range
3. `percentage` bucket (djb2 hash, stable per install+entity)
4. `user_ids` contains this userId (OR within list)
5. `segment_keys` — any segment matches (OR between segments; each segment's rules are AND'd)
6. All `user_attribute_rules` pass (AND)

---

## Section 2 — Named Segments

### DB table (db.ts)

```sql
CREATE TABLE IF NOT EXISTS segments (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  rules       TEXT NOT NULL,  -- JSON: AttributeRule[]
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

### Seed segments (created at server startup if not present):
| key | name | rules |
|-----|------|-------|
| `premium_users` | Premium Users | `plan eq premium` |
| `beta_testers` | Beta Testers | `email_domain eq rumik.dev` |
| `new_users` | New Users | `account_age_days lt 7` |
| `power_users` | Power Users | `account_age_days gt 30` |

### API: `routes/segments.ts`
- `GET /api/segments` — list all
- `POST /api/segments` — create
- `PATCH /api/segments/:id` — update
- `DELETE /api/segments/:id` — delete
- `POST /api/segments/:id/test` — test a user context against the segment, returns `{ matches: boolean, failed_rules: AttributeRule[] }`

---

## Section 3 — Config Endpoint: User Context

### Updated query params (routes/config.ts)
```
GET /api/config
  ?platform=ios
  &native_version=1.0.0
  &install_id=abc123
  &user_id=user_clerk_xyz          ← NEW
  &plan=free                        ← NEW
  &email_domain=gmail.com           ← NEW
  &account_age_days=14              ← NEW
```

### Updated QuerySchema
```typescript
const QuerySchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  native_version: z.string().min(1),
  install_id: z.string().min(1),
  user_id: z.string().optional(),
  plan: z.string().optional(),
  email_domain: z.string().optional(),
  account_age_days: z.coerce.number().optional(),
});
```

The `evaluateTargeting` function signature gains a second argument: `(rule, deviceCtx, userCtx?)`.

---

## Section 4 — Kill Switch Targeting

### DB migration
```sql
ALTER TABLE kill_switches ADD COLUMN targeting TEXT;
```

### Updated config evaluation (routes/config.ts)
Kill switches pass through `evaluateTargeting` the same as flags — active AND in targeting.

### Demo kill switches to seed:
| key | targeting | purpose |
|-----|-----------|---------|
| `disable_audio_ios` | `platforms: ['ios']` | iOS-only audio kill |
| `disable_search` | *(global)* | existing |
| `disable_offline_mode` | `segment_keys: ['new_users']` | block downloads for new accounts |
| `disable_social_share` | `platforms: ['android']` | Android-only share kill |

---

## Section 5 — Scheduled Flag Changes

### DB table
```sql
CREATE TABLE IF NOT EXISTS flag_schedules (
  id           TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL,  -- 'flag' | 'kill_switch' | 'experiment'
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL,  -- 'enable' | 'disable' | 'set_percentage'
  payload      TEXT,           -- JSON e.g. { "percentage": 50 }
  scheduled_at TEXT NOT NULL,
  executed_at  TEXT,
  created_by   TEXT NOT NULL DEFAULT 'system',
  created_at   TEXT NOT NULL
);
```

### Scheduler extension (rolloutScheduler.ts)
The existing tick function gains a second job after rollout advancement:
1. `SELECT * FROM flag_schedules WHERE scheduled_at <= ? AND executed_at IS NULL`
2. For each row: execute the action, write `executed_at = now`, write audit log entry

### API endpoints
- `GET /api/schedules` — list all (pending + executed)
- `POST /api/schedules` — create
- `DELETE /api/schedules/:id` — cancel (only if not yet executed)

### Demo schedules seeded at startup (relative to server start):
- `+2min`: enable `show_premium_upsell`
- `+5min`: set `enable_social_share` percentage to 50
- `+8min`: set experiment `home_layout` status to `completed`

---

## Section 6 — Experiment Exposure & Conversion Tracking

### DB tables
```sql
CREATE TABLE IF NOT EXISTS experiment_exposures (
  id            TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  install_id    TEXT NOT NULL,
  user_id       TEXT,
  variant_id    TEXT NOT NULL,
  exposed_at    TEXT NOT NULL,
  UNIQUE (experiment_id, install_id)  -- one exposure record per device per experiment
);

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

CREATE INDEX IF NOT EXISTS idx_exposures_exp ON experiment_exposures(experiment_id);
CREATE INDEX IF NOT EXISTS idx_conversions_exp ON experiment_conversions(experiment_id, event_name);
```

### API endpoints (routes/experiments.ts additions)
```
POST /api/experiments/:key/expose
  body: { install_id, user_id?, variant_id }
  → upserts experiment_exposures (conflict: ignore)

POST /api/experiments/:key/convert
  body: { install_id, user_id?, variant_id, event_name, value? }
  → inserts experiment_conversions

GET /api/experiments/:key/results
  → aggregated stats per variant:
  {
    variants: [
      { id, exposures, conversions, rate, lift_vs_control },
      ...
    ],
    winner: string | null  // variant_id with highest rate if ≥10% lift
  }
```

---

## Section 7 — Actor Identity in Audit Log

The `adminSession.ts` route stores `actor_name` in the session (the username submitted at login). A new middleware `attachActor` reads the session and sets `req.adminActor: string`. All route handlers that call `logChange()` pass `req.adminActor` as the actor argument.

The `logChange` function signature:
```typescript
function logChange(
  entityType: string,
  entityId: string,
  action: string,
  changes: object | null,
  actor?: string,   // defaults to 'system' if not provided
): void
```

---

## Section 8 — Real Feature Flags

### `show_premium_upsell`
- **Gate:** renders `<PremiumUpsellCard />` on Home screen between RECENTLY PLAYED and FEATURED
- **Component:** `src/components/ui/PremiumUpsellCard.tsx` — card with "Go Premium" headline, bullet features, "Upgrade" button (shows Alert for demo)
- **Default targeting:** `user_attribute_rules: [{ attribute: 'plan', operator: 'neq', value: 'premium' }]`

### `enable_social_share`
- **Gate:** adds share icon button to `TrackRow` and `NowPlaying` player
- **Behavior:** calls `Share.share({ message: \`${track.title} by ${track.artist} — listening on rumik\` })`
- **Default targeting:** `percentage: 50`

### `enable_offline_mode`
- **Gate:** adds download icon to `TrackRow`; if downloaded, plays from local file instead of URL
- **Behavior:** `expo-file-system` downloads preview MP3 to `FileSystem.documentDirectory + 'offline/'`; player service checks for local file before using stream URL
- **Default targeting:** `segment_keys: ['premium_users']`

### `enable_lyrics_link`
- **Gate:** adds "Lyrics" button to `NowPlaying` full-screen player
- **Behavior:** `expo-web-browser` opens `https://genius.com/search?q=${encodeURIComponent(artist + ' ' + title)}`
- **Default targeting:** `platforms: ['ios', 'android']`

---

## Section 9 — Real Experiments

### `home_layout` (3 variants)
| variant | section order |
|---------|--------------|
| `control` | Genre Pills → Featured → Recently Played → Charts |
| `charts_first` | Genre Pills → Charts → Featured → Recently Played |
| `recent_first` | Genre Pills → Recently Played → Charts → Featured |

- **Exposure:** fires when Home screen mounts and variant is assigned
- **Conversion event:** `track_played_home` — fires in `handlePlay` on the Home screen
- **Result metric:** conversion rate = devices that played at least one track / devices exposed

### `player_ui` (2 variants)
| variant | player style |
|---------|-------------|
| `control` | Current compact MiniPlayer strip |
| `immersive` | Full-screen modal: blurred album art background, large album art, gradient overlay, big play/skip controls |

- **Exposure:** fires when MiniPlayer first renders with a track loaded
- **Conversion event:** `track_completed` — fires when track playback reaches >80% duration
- **Result metric:** mean tracks completed per exposed device

### `search_prompt_copy` (2 variants)
| variant | TextInput placeholder |
|---------|-----------------------|
| `control` | "Search artists, tracks…" |
| `variant_a` | "What are you in the mood for?" |

- **Exposure:** fires when Discover screen mounts
- **Conversion event:** `search_completed` — fires when query ≥ 2 chars and results render
- **Result metric:** conversion rate = devices that completed a search / devices exposed

---

## Section 10 — Client SDK Changes

### `ConfigClientOptions` additions
```typescript
interface ConfigClientOptions {
  // existing...
  userId?: string;
  userPlan?: string;
  emailDomain?: string;
  accountAgeDays?: number;
}
```

### `ConfigClient.fetchAndUpdate()` updated params
```typescript
const params = new URLSearchParams({
  platform, native_version, install_id,
  ...(userId && { user_id: userId }),
  ...(userPlan && { plan: userPlan }),
  ...(emailDomain && { email_domain: emailDomain }),
  ...(accountAgeDays !== undefined && { account_age_days: String(accountAgeDays) }),
});
```

### New method: `ConfigClient.setUserContext(ctx: UserContext)`
Called when user signs in/out. Updates the stored user fields and calls `fetchAndUpdate()`.

### `RemoteConfigProvider` changes
Accepts `user` prop (Clerk `UserResource | null`). Derives `userPlan`, `emailDomain`, `accountAgeDays` from the Clerk user object. Calls `client.setUserContext()` in a `useEffect` whenever `user` changes.

### New hooks (`useRemoteConfig.tsx`)
```typescript
// Fires POST /api/experiments/:key/expose once per session per experiment
function useExperimentTracking(key: string, variant: string): void

// Returns a stable function to fire conversions
function useTrackConversion(): (key: string, eventName: string, value?: number) => void
```

Both are fire-and-forget (`void fetch(...)`). Exposures are deduplicated client-side with a `Set<string>` in a module-level ref (survives re-renders, cleared on app restart).

---

## Section 11 — Admin Dashboard Additions

Four new pages added to the Express HTML dashboard:

**`/admin/segments`** — list, create, edit, delete segments; "Test User" panel: input userId + attributes → see which segments match and which rules failed

**`/admin/experiments/:id/results`** — table of variant stats; winner highlighted; auto-refreshes every 30s via `setInterval` + fetch

**`/admin/schedules`** — list upcoming schedules with countdown, create new schedule, cancel pending

**Audit log page** — add actor column; add filter by entity type, actor name, date range

---

## File Change Map

### OTA Server (`ota-server/src/`)
| File | Change |
|------|--------|
| `db.ts` | Add segments, experiment_exposures, experiment_conversions, flag_schedules tables; migration for kill_switches.targeting |
| `services/targeting.ts` | Add UserContext, AttributeRule, segment lookup, user_attribute_rules evaluation |
| `routes/config.ts` | Accept user context params, pass to evaluateTargeting for all entity types |
| `routes/flags.ts` | Extended TargetingSchema with user fields |
| `routes/killSwitches.ts` | Add targeting column support, evaluateTargeting in config |
| `routes/experiments.ts` | Add /expose, /convert, /results endpoints |
| `routes/segments.ts` | New — full CRUD + /test endpoint |
| `routes/schedules.ts` | New — CRUD for flag_schedules |
| `rolloutScheduler.ts` | Add flag_schedules execution job |
| `middleware/auth.ts` | Attach actor name from session to req |
| `services/audit.ts` | Add actor param to logChange |
| `index.ts` | Register segments and schedules routes; seed demo data |

### Client (`src/` and `app/`)
| File | Change |
|------|--------|
| `services/config/ConfigClient.ts` | Add user context fields, setUserContext(), updated fetch params |
| `services/config/types.ts` | Add UserContext to ConfigClientOptions |
| `hooks/useRemoteConfig.tsx` | Updated provider props, useExperimentTracking, useTrackConversion |
| `services/player.tsx` | Check local file before streaming (offline mode) |
| `components/ui/PremiumUpsellCard.tsx` | New component |
| `components/track/TrackRow.tsx` | Conditional share + download icons |
| `components/player/NowPlaying.tsx` | Lyrics button, immersive variant, share button |
| `components/player/MiniPlayer.tsx` | Immersive variant toggle |
| `app/_layout.tsx` | Pass Clerk user to RemoteConfigProvider |
| `app/(tabs)/index.tsx` | home_layout experiment variants, show_premium_upsell gate, useExperimentTracking, useTrackConversion |
| `app/(tabs)/discover.tsx` | search_prompt_copy experiment, useExperimentTracking, useTrackConversion |
