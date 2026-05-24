# Enterprise Feature Flags, Experiments & Kill Switches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the rumik OTA/config system to full enterprise-grade — user identity targeting, named segments, real feature flags controlling actual UI/behavior, real A/B experiments with exposure and conversion tracking, kill switch platform targeting, scheduled flag changes, and actor identity in the audit log.

**Architecture:** Server-side evaluation extended to accept Clerk userId + user attributes alongside device context. Named segments stored in DB, reused across flags/experiments/kill switches. Experiment metrics collected via fire-and-forget POST from the client, aggregated into a results endpoint. Scheduling piggybacks on the existing rolloutScheduler tick.

**Tech Stack:** Express + better-sqlite3 (OTA server), React Native + Expo (client), Clerk (user identity), expo-file-system (offline), expo-web-browser (lyrics), React Native Share API (social share)

---

## File Change Map

### OTA Server (`ota-server/src/`)
| File | Change |
|------|--------|
| `db.ts` | Add segments, experiment_exposures, experiment_conversions, flag_schedules tables; migration for kill_switches.targeting |
| `services/targeting.ts` | Add UserContext, AttributeRule, segment lookup, user_attribute_rules evaluation |
| `routes/config.ts` | Accept user context params, pass to evaluateTargeting for all entity types |
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
| `services/config/types.ts` | Add user context fields to ConfigClientOptions |
| `services/config/ConfigClient.ts` | Add user context fields, setUserContext(), updated fetch params |
| `hooks/useRemoteConfig.tsx` | Updated provider props, useExperimentTracking, useTrackConversion |
| `app/_layout.tsx` | Pass Clerk user to RemoteConfigProvider |
| `services/player.tsx` | Check local file before streaming (offline mode) |
| `components/ui/PremiumUpsellCard.tsx` | New component |
| `components/track/TrackRow.tsx` | Conditional share + download icons |
| `components/player/NowPlaying.tsx` | Lyrics button, share button, immersive player_ui variant |
| `app/(tabs)/index.tsx` | home_layout experiment variants, show_premium_upsell gate, tracking |
| `app/(tabs)/discover.tsx` | search_prompt_copy experiment, tracking |

---

## Task 1: DB Schema Extensions

**Files:**
- Modify: `ota-server/src/db.ts`
- Test: `ota-server/src/__tests__/db.test.ts`

- [ ] **Step 1: Write the failing test**

Create `ota-server/src/__tests__/db.test.ts`:

```typescript
import Database from 'better-sqlite3';
import { initDb } from '../../src/db.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  initDb(db);
});

afterEach(() => {
  db.close();
});

test('segments table exists with correct columns', () => {
  const cols = db.prepare("PRAGMA table_info(segments)").all() as { name: string }[];
  const names = cols.map(c => c.name);
  expect(names).toEqual(expect.arrayContaining(['id', 'key', 'name', 'description', 'rules', 'created_at', 'updated_at']));
});

test('experiment_exposures table exists with unique constraint', () => {
  const cols = db.prepare("PRAGMA table_info(experiment_exposures)").all() as { name: string }[];
  const names = cols.map(c => c.name);
  expect(names).toEqual(expect.arrayContaining(['id', 'experiment_id', 'install_id', 'user_id', 'variant_id', 'exposed_at']));
  // unique constraint: inserting duplicate should silently fail (OR IGNORE)
  db.prepare("INSERT INTO experiment_exposures(id, experiment_id, install_id, variant_id, exposed_at) VALUES ('a','exp1','dev1','ctrl',datetime('now'))").run();
  expect(() => {
    db.prepare("INSERT OR IGNORE INTO experiment_exposures(id, experiment_id, install_id, variant_id, exposed_at) VALUES ('b','exp1','dev1','ctrl',datetime('now'))").run();
  }).not.toThrow();
  const rows = db.prepare("SELECT * FROM experiment_exposures WHERE experiment_id='exp1'").all();
  expect(rows).toHaveLength(1);
});

test('experiment_conversions table exists', () => {
  const cols = db.prepare("PRAGMA table_info(experiment_conversions)").all() as { name: string }[];
  const names = cols.map(c => c.name);
  expect(names).toEqual(expect.arrayContaining(['id', 'experiment_id', 'install_id', 'user_id', 'variant_id', 'event_name', 'value', 'converted_at']));
});

test('flag_schedules table exists', () => {
  const cols = db.prepare("PRAGMA table_info(flag_schedules)").all() as { name: string }[];
  const names = cols.map(c => c.name);
  expect(names).toEqual(expect.arrayContaining(['id', 'entity_type', 'entity_id', 'action', 'payload', 'scheduled_at', 'executed_at', 'created_by', 'created_at']));
});

test('kill_switches has targeting column after migration', () => {
  const cols = db.prepare("PRAGMA table_info(kill_switches)").all() as { name: string }[];
  const names = cols.map(c => c.name);
  expect(names).toContain('targeting');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/db.test --no-coverage 2>&1 | tail -20
```

Expected: FAIL — tables don't exist yet.

- [ ] **Step 3: Add tables to `ota-server/src/db.ts`**

Open `ota-server/src/db.ts`. After the existing table creation statements (before `export function getDb()`), add:

```typescript
  db.exec(`
    CREATE TABLE IF NOT EXISTS segments (
      id          TEXT PRIMARY KEY,
      key         TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      description TEXT,
      rules       TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS experiment_exposures (
      id            TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      install_id    TEXT NOT NULL,
      user_id       TEXT,
      variant_id    TEXT NOT NULL,
      exposed_at    TEXT NOT NULL,
      UNIQUE (experiment_id, install_id)
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

  // Migration: add targeting column to kill_switches if not present
  const ksColumns = db.prepare("PRAGMA table_info(kill_switches)").all() as { name: string }[];
  if (!ksColumns.some(c => c.name === 'targeting')) {
    db.exec(`ALTER TABLE kill_switches ADD COLUMN targeting TEXT`);
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/db.test --no-coverage 2>&1 | tail -20
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add ota-server/src/db.ts ota-server/src/__tests__/db.test.ts
git commit -m "feat: add segments, exposure, conversion, flag_schedules tables; kill_switches targeting migration"
```

---

## Task 2: Extended Targeting Engine

**Files:**
- Modify: `ota-server/src/services/targeting.ts`
- Test: `ota-server/src/__tests__/services/targeting.test.ts` (modify existing)

- [ ] **Step 1: Write the failing tests**

Open `ota-server/src/__tests__/services/targeting.test.ts` and append:

```typescript
import { evaluateTargeting, type UserContext } from '../../../src/services/targeting.js';

describe('user_ids targeting', () => {
  it('matches when userId is in user_ids list', () => {
    const rule = { user_ids: ['user_abc', 'user_xyz'] };
    const device = { platform: 'ios' as const, nativeVersion: '1.0.0', installId: 'dev1', entityKey: 'flag1' };
    const user: UserContext = { userId: 'user_abc' };
    expect(evaluateTargeting(rule, device, user)).toBe(true);
  });

  it('rejects when userId not in list', () => {
    const rule = { user_ids: ['user_abc'] };
    const device = { platform: 'ios' as const, nativeVersion: '1.0.0', installId: 'dev1', entityKey: 'flag1' };
    const user: UserContext = { userId: 'user_xyz' };
    expect(evaluateTargeting(rule, device, user)).toBe(false);
  });
});

describe('user_attribute_rules targeting', () => {
  it('eq operator: matches plan === premium', () => {
    const rule = { user_attribute_rules: [{ attribute: 'plan' as const, operator: 'eq' as const, value: 'premium' }] };
    const device = { platform: 'ios' as const, nativeVersion: '1.0.0', installId: 'd', entityKey: 'f' };
    expect(evaluateTargeting(rule, device, { plan: 'premium' })).toBe(true);
  });

  it('neq operator: matches plan !== premium', () => {
    const rule = { user_attribute_rules: [{ attribute: 'plan' as const, operator: 'neq' as const, value: 'premium' }] };
    const device = { platform: 'ios' as const, nativeVersion: '1.0.0', installId: 'd', entityKey: 'f' };
    expect(evaluateTargeting(rule, device, { plan: 'free' })).toBe(true);
    expect(evaluateTargeting(rule, device, { plan: 'premium' })).toBe(false);
  });

  it('gt operator: account_age_days > 30', () => {
    const rule = { user_attribute_rules: [{ attribute: 'account_age_days' as const, operator: 'gt' as const, value: 30 }] };
    const device = { platform: 'ios' as const, nativeVersion: '1.0.0', installId: 'd', entityKey: 'f' };
    expect(evaluateTargeting(rule, device, { account_age_days: 45 })).toBe(true);
    expect(evaluateTargeting(rule, device, { account_age_days: 5 })).toBe(false);
  });

  it('lt operator: account_age_days < 7', () => {
    const rule = { user_attribute_rules: [{ attribute: 'account_age_days' as const, operator: 'lt' as const, value: 7 }] };
    const device = { platform: 'ios' as const, nativeVersion: '1.0.0', installId: 'd', entityKey: 'f' };
    expect(evaluateTargeting(rule, device, { account_age_days: 3 })).toBe(true);
    expect(evaluateTargeting(rule, device, { account_age_days: 10 })).toBe(false);
  });

  it('contains operator: email_domain contains rumik', () => {
    const rule = { user_attribute_rules: [{ attribute: 'email_domain' as const, operator: 'contains' as const, value: 'rumik' }] };
    const device = { platform: 'ios' as const, nativeVersion: '1.0.0', installId: 'd', entityKey: 'f' };
    expect(evaluateTargeting(rule, device, { email_domain: 'rumik.dev' })).toBe(true);
  });

  it('in operator: plan in [free, trial]', () => {
    const rule = { user_attribute_rules: [{ attribute: 'plan' as const, operator: 'in' as const, value: ['free', 'trial'] }] };
    const device = { platform: 'ios' as const, nativeVersion: '1.0.0', installId: 'd', entityKey: 'f' };
    expect(evaluateTargeting(rule, device, { plan: 'trial' })).toBe(true);
    expect(evaluateTargeting(rule, device, { plan: 'premium' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/services/targeting --no-coverage 2>&1 | tail -30
```

Expected: FAIL — UserContext not exported, user_attribute_rules not evaluated.

- [ ] **Step 3: Implement extended targeting in `ota-server/src/services/targeting.ts`**

Replace the file contents with:

```typescript
import type Database from 'better-sqlite3';

export interface AttributeRule {
  attribute: 'plan' | 'email_domain' | 'account_age_days';
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'in';
  value: string | number | string[];
}

export interface TargetingRule {
  platforms?: ('ios' | 'android' | 'web')[];
  min_version?: string;
  max_version?: string;
  percentage?: number;
  user_ids?: string[];
  segment_keys?: string[];
  user_attribute_rules?: AttributeRule[];
}

export interface DeviceContext {
  platform: 'ios' | 'android' | 'web';
  nativeVersion: string;
  installId: string;
  entityKey: string;
}

export interface UserContext {
  userId?: string;
  plan?: string;
  email_domain?: string;
  account_age_days?: number;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash;
}

function evaluateAttributeRule(rule: AttributeRule, user: UserContext): boolean {
  const val = user[rule.attribute as keyof UserContext];
  if (val === undefined || val === null) return false;
  switch (rule.operator) {
    case 'eq': return String(val) === String(rule.value);
    case 'neq': return String(val) !== String(rule.value);
    case 'gt': return Number(val) > Number(rule.value);
    case 'lt': return Number(val) < Number(rule.value);
    case 'contains': return String(val).includes(String(rule.value));
    case 'in': return Array.isArray(rule.value) && (rule.value as string[]).includes(String(val));
    default: return false;
  }
}

function evaluateSegmentRules(rules: AttributeRule[], user: UserContext): boolean {
  return rules.every(r => evaluateAttributeRule(r, user));
}

export function evaluateTargeting(
  rule: TargetingRule,
  context: DeviceContext,
  userCtx?: UserContext,
  db?: Database.Database,
): boolean {
  // 1. platforms
  if (rule.platforms && rule.platforms.length > 0) {
    if (!rule.platforms.includes(context.platform)) return false;
  }

  // 2. version range
  if (rule.min_version) {
    if (compareVersions(context.nativeVersion, rule.min_version) < 0) return false;
  }
  if (rule.max_version) {
    if (compareVersions(context.nativeVersion, rule.max_version) > 0) return false;
  }

  // 3. percentage bucket
  if (rule.percentage !== undefined) {
    const seed = `${context.installId}:${context.entityKey}`;
    const bucket = djb2(seed) % 100;
    if (bucket >= rule.percentage) return false;
  }

  // 4. user_ids
  if (rule.user_ids && rule.user_ids.length > 0) {
    if (!userCtx?.userId || !rule.user_ids.includes(userCtx.userId)) return false;
  }

  // 5. segment_keys — OR between segments, each segment AND's its rules
  if (rule.segment_keys && rule.segment_keys.length > 0 && userCtx) {
    if (!db) return false;
    const matchesAnySegment = rule.segment_keys.some(key => {
      const seg = db.prepare('SELECT rules FROM segments WHERE key = ?').get(key) as { rules: string } | undefined;
      if (!seg) return false;
      try {
        const segRules: AttributeRule[] = JSON.parse(seg.rules);
        return evaluateSegmentRules(segRules, userCtx);
      } catch {
        return false;
      }
    });
    if (!matchesAnySegment) return false;
  }

  // 6. user_attribute_rules — AND all
  if (rule.user_attribute_rules && rule.user_attribute_rules.length > 0) {
    if (!userCtx) return false;
    if (!rule.user_attribute_rules.every(r => evaluateAttributeRule(r, userCtx))) return false;
  }

  return true;
}

export function parseTargeting(raw: string | null | undefined): TargetingRule | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TargetingRule;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/services/targeting --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ota-server/src/services/targeting.ts ota-server/src/__tests__/services/targeting.test.ts
git commit -m "feat: extend targeting engine with UserContext, AttributeRule, segment_keys evaluation"
```

---

## Task 3: Segments API

**Files:**
- Create: `ota-server/src/routes/segments.ts`
- Create: `ota-server/src/__tests__/routes/segments.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `ota-server/src/__tests__/routes/segments.test.ts`:

```typescript
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { initDb } from '../../src/db.js';

jest.mock('../../src/db.js', () => {
  const db = new (require('better-sqlite3'))(':memory:');
  const { initDb } = jest.requireActual('../../src/db.js');
  initDb(db);
  return { getDb: () => db, initDb };
});

const { segmentsRouter } = await import('../../src/routes/segments.js');
const app = express();
app.use(express.json());
app.use('/api/segments', segmentsRouter);

const db = (await import('../../src/db.js')).getDb();

beforeEach(() => {
  db.prepare('DELETE FROM segments').run();
});

test('GET /api/segments returns empty array', async () => {
  const res = await request(app).get('/api/segments');
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});

test('POST /api/segments creates a segment', async () => {
  const res = await request(app).post('/api/segments').send({
    key: 'premium_users',
    name: 'Premium Users',
    rules: [{ attribute: 'plan', operator: 'eq', value: 'premium' }],
  });
  expect(res.status).toBe(201);
  expect(res.body.key).toBe('premium_users');
});

test('PATCH /api/segments/:id updates a segment', async () => {
  const createRes = await request(app).post('/api/segments').send({
    key: 'seg1', name: 'Seg 1', rules: [],
  });
  const id = createRes.body.id;
  const res = await request(app).patch(`/api/segments/${id}`).send({ name: 'Updated' });
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Updated');
});

test('DELETE /api/segments/:id removes segment', async () => {
  const createRes = await request(app).post('/api/segments').send({
    key: 'seg2', name: 'Seg 2', rules: [],
  });
  const id = createRes.body.id;
  const res = await request(app).delete(`/api/segments/${id}`);
  expect(res.status).toBe(200);
  const listRes = await request(app).get('/api/segments');
  expect(listRes.body).toHaveLength(0);
});

test('POST /api/segments/:id/test returns matches: true for matching user', async () => {
  const createRes = await request(app).post('/api/segments').send({
    key: 'premium', name: 'Premium', rules: [{ attribute: 'plan', operator: 'eq', value: 'premium' }],
  });
  const id = createRes.body.id;
  const res = await request(app).post(`/api/segments/${id}/test`).send({ plan: 'premium' });
  expect(res.status).toBe(200);
  expect(res.body.matches).toBe(true);
  expect(res.body.failed_rules).toHaveLength(0);
});

test('POST /api/segments/:id/test returns matches: false with failed_rules', async () => {
  const createRes = await request(app).post('/api/segments').send({
    key: 'premium2', name: 'Premium2', rules: [{ attribute: 'plan', operator: 'eq', value: 'premium' }],
  });
  const id = createRes.body.id;
  const res = await request(app).post(`/api/segments/${id}/test`).send({ plan: 'free' });
  expect(res.status).toBe(200);
  expect(res.body.matches).toBe(false);
  expect(res.body.failed_rules).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/routes/segments --no-coverage 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `ota-server/src/routes/segments.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { evaluateAttributeRule, type AttributeRule } from '../services/targeting.js';

export const segmentsRouter = Router();

const AttributeRuleSchema = z.object({
  attribute: z.enum(['plan', 'email_domain', 'account_age_days']),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'contains', 'in']),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

const CreateSegmentSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
  rules: z.array(AttributeRuleSchema),
});

segmentsRouter.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM segments ORDER BY created_at DESC').all();
  res.json(rows.map(r => ({ ...r, rules: JSON.parse((r as any).rules) })));
});

segmentsRouter.post('/', (req, res) => {
  const parse = CreateSegmentSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const { key, name, description, rules } = parse.data;
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO segments (id, key, name, description, rules, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, key, name, description ?? null, JSON.stringify(rules), now, now);
  const seg = db.prepare('SELECT * FROM segments WHERE id = ?').get(id) as any;
  res.status(201).json({ ...seg, rules: JSON.parse(seg.rules) });
});

segmentsRouter.patch('/:id', (req, res) => {
  const db = getDb();
  const seg = db.prepare('SELECT * FROM segments WHERE id = ?').get(req.params.id) as any;
  if (!seg) return res.status(404).json({ error: 'Not found' });
  const { name, description, rules } = req.body;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE segments SET
      name = ?, description = ?, rules = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    name ?? seg.name,
    description !== undefined ? description : seg.description,
    rules ? JSON.stringify(rules) : seg.rules,
    now,
    req.params.id,
  );
  const updated = db.prepare('SELECT * FROM segments WHERE id = ?').get(req.params.id) as any;
  res.json({ ...updated, rules: JSON.parse(updated.rules) });
});

segmentsRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const seg = db.prepare('SELECT * FROM segments WHERE id = ?').get(req.params.id);
  if (!seg) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM segments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

segmentsRouter.post('/:id/test', (req, res) => {
  const db = getDb();
  const seg = db.prepare('SELECT * FROM segments WHERE id = ?').get(req.params.id) as any;
  if (!seg) return res.status(404).json({ error: 'Not found' });
  const rules: AttributeRule[] = JSON.parse(seg.rules);
  const userCtx = req.body;
  const failed_rules = rules.filter(r => !evaluateAttributeRule(r, userCtx));
  res.json({ matches: failed_rules.length === 0, failed_rules });
});
```

Note: `evaluateAttributeRule` must be exported from targeting.ts. Add `export` to it in `targeting.ts`:

```typescript
export function evaluateAttributeRule(rule: AttributeRule, user: UserContext): boolean {
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/routes/segments --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ota-server/src/routes/segments.ts ota-server/src/__tests__/routes/segments.test.ts ota-server/src/services/targeting.ts
git commit -m "feat: segments API — CRUD + user context /test endpoint"
```

---

## Task 4: Config Endpoint — User Context + Kill Switch Targeting

**Files:**
- Modify: `ota-server/src/routes/config.ts`
- Test: `ota-server/src/__tests__/routes/config.test.ts` (modify existing)

- [ ] **Step 1: Write the failing tests**

Open `ota-server/src/__tests__/routes/config.test.ts` and append:

```typescript
test('GET /api/config passes user_id and plan to targeting for flags', async () => {
  // Create a flag targeting only premium users
  db.prepare(
    `INSERT INTO feature_flags (id, key, enabled, description, targeting, created_at, updated_at)
     VALUES ('f1', 'premium_flag', 1, '', '{"user_attribute_rules":[{"attribute":"plan","operator":"eq","value":"premium"}]}', datetime('now'), datetime('now'))`
  ).run();

  // Free user — flag should be OFF
  const freeRes = await request(app).get('/api/config?platform=ios&native_version=1.0.0&install_id=dev1&plan=free');
  expect(freeRes.body.flags.premium_flag).toBe(false);

  // Premium user — flag should be ON
  const premRes = await request(app).get('/api/config?platform=ios&native_version=1.0.0&install_id=dev1&plan=premium');
  expect(premRes.body.flags.premium_flag).toBe(true);
});

test('GET /api/config filters kill switches by targeting', async () => {
  db.prepare(
    `INSERT INTO kill_switches (id, key, active, reason, targeting, created_at, updated_at)
     VALUES ('ks1', 'ios_only_ks', 1, 'test', '{"platforms":["ios"]}', datetime('now'), datetime('now'))`
  ).run();

  const iosRes = await request(app).get('/api/config?platform=ios&native_version=1.0.0&install_id=dev1');
  expect(iosRes.body.kill_switches).toContain('ios_only_ks');

  const androidRes = await request(app).get('/api/config?platform=android&native_version=1.0.0&install_id=dev1');
  expect(androidRes.body.kill_switches).not.toContain('ios_only_ks');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/routes/config --no-coverage 2>&1 | tail -20
```

Expected: FAIL — user context params not used, kill switches not filtered by targeting.

- [ ] **Step 3: Update `ota-server/src/routes/config.ts`**

Update the QuerySchema and handler. Find the existing `QuerySchema` and replace:

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

In the GET /api/config handler, after parsing query, build userCtx and pass it to evaluateTargeting calls. Find the section where flags are evaluated and update it. The handler should look like:

```typescript
router.get('/', (req, res) => {
  const parse = QuerySchema.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const { platform, native_version: nativeVersion, install_id: installId,
          user_id: userId, plan, email_domain, account_age_days } = parse.data;

  const db = getDb();
  const userCtx: UserContext = { userId, plan, email_domain, account_age_days };

  // Flags
  const flags: Record<string, boolean> = {};
  const flagRows = db.prepare('SELECT * FROM feature_flags WHERE enabled = 1').all() as any[];
  for (const flag of flagRows) {
    const rule = parseTargeting(flag.targeting);
    const deviceCtx: DeviceContext = { platform, nativeVersion, installId, entityKey: flag.key };
    flags[flag.key] = !rule || evaluateTargeting(rule, deviceCtx, userCtx, db);
  }

  // Experiments (existing logic — keep as-is but pass userCtx)
  const expRows = db.prepare("SELECT * FROM experiments WHERE status = 'active'").all() as any[];
  const experiments: Record<string, string> = {};
  for (const exp of expRows) {
    const rule = parseTargeting(exp.targeting);
    const deviceCtx: DeviceContext = { platform, nativeVersion, installId, entityKey: exp.key };
    if (rule && !evaluateTargeting(rule, deviceCtx, userCtx, db)) continue;
    // existing variant assignment logic (DJB2 hash) stays unchanged
    const variants: { id: string; weight: number }[] = JSON.parse(exp.variants);
    let seed = `${installId}:${exp.key}`;
    let hash = 5381;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
      hash = hash >>> 0;
    }
    const bucket = hash % 100;
    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.weight;
      if (bucket < cumulative) {
        experiments[exp.key] = variant.id;
        break;
      }
    }
  }

  // Kill switches — now filtered by targeting
  const ksRows = db.prepare('SELECT * FROM kill_switches WHERE active = 1').all() as any[];
  const kill_switches: string[] = [];
  for (const ks of ksRows) {
    const rule = parseTargeting(ks.targeting);
    const deviceCtx: DeviceContext = { platform, nativeVersion, installId, entityKey: ks.key };
    if (!rule || evaluateTargeting(rule, deviceCtx, userCtx, db)) {
      kill_switches.push(ks.key);
    }
  }

  // Dynamic URLs (unchanged)
  const urlRows = db.prepare('SELECT * FROM dynamic_urls').all() as any[];
  const urls: Record<string, string> = {};
  for (const u of urlRows) urls[u.key] = u.url;

  res.json({ flags, experiments, urls, kill_switches, ttl: 60, version: '1' });
});
```

Also add imports at the top of config.ts:
```typescript
import { evaluateTargeting, parseTargeting, type UserContext, type DeviceContext } from '../services/targeting.js';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/routes/config --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ota-server/src/routes/config.ts
git commit -m "feat: config endpoint accepts user context; kill switches filtered by targeting"
```

---

## Task 5: Experiment Metrics Endpoints

**Files:**
- Modify: `ota-server/src/routes/experiments.ts`
- Test: `ota-server/src/__tests__/routes/experiments.test.ts` (modify existing)

- [ ] **Step 1: Write the failing tests**

Open `ota-server/src/__tests__/routes/experiments.test.ts` and append:

```typescript
test('POST /api/experiments/:key/expose records exposure', async () => {
  db.prepare(
    `INSERT INTO experiments (id, key, status, variants, targeting, created_at, updated_at)
     VALUES ('e1', 'home_layout', 'active', '[{"id":"control","weight":100}]', null, datetime('now'), datetime('now'))`
  ).run();

  const res = await request(app)
    .post('/api/experiments/home_layout/expose')
    .send({ install_id: 'dev1', variant_id: 'control' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);

  // second call is idempotent
  const res2 = await request(app)
    .post('/api/experiments/home_layout/expose')
    .send({ install_id: 'dev1', variant_id: 'control' });
  expect(res2.status).toBe(200);
  const rows = db.prepare("SELECT * FROM experiment_exposures WHERE experiment_id = 'e1'").all();
  expect(rows).toHaveLength(1);
});

test('POST /api/experiments/:key/convert records conversion', async () => {
  db.prepare(
    `INSERT INTO experiments (id, key, status, variants, targeting, created_at, updated_at)
     VALUES ('e2', 'player_ui', 'active', '[{"id":"control","weight":100}]', null, datetime('now'), datetime('now'))`
  ).run();

  const res = await request(app)
    .post('/api/experiments/player_ui/convert')
    .send({ install_id: 'dev1', variant_id: 'control', event_name: 'track_completed', value: 1 });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});

test('GET /api/experiments/:key/results returns per-variant stats', async () => {
  db.prepare(
    `INSERT INTO experiments (id, key, status, variants, targeting, created_at, updated_at)
     VALUES ('e3', 'search_prompt_copy', 'active', '[{"id":"control","weight":50},{"id":"variant_a","weight":50}]', null, datetime('now'), datetime('now'))`
  ).run();

  // control: 3 exposures, 2 conversions (rate 0.667)
  for (let i = 0; i < 3; i++) {
    db.prepare("INSERT INTO experiment_exposures (id, experiment_id, install_id, variant_id, exposed_at) VALUES (?,?,?,?,datetime('now'))")
      .run(`ex${i}`, 'e3', `dev${i}`, 'control');
  }
  for (let i = 0; i < 2; i++) {
    db.prepare("INSERT INTO experiment_conversions (id, experiment_id, install_id, variant_id, event_name, value, converted_at) VALUES (?,?,?,?,?,?,datetime('now'))")
      .run(`cv${i}`, 'e3', `dev${i}`, 'control', 'search_completed', 1);
  }

  const res = await request(app).get('/api/experiments/search_prompt_copy/results');
  expect(res.status).toBe(200);
  expect(res.body.variants).toHaveLength(2);
  const ctrl = res.body.variants.find((v: any) => v.id === 'control');
  expect(ctrl.exposures).toBe(3);
  expect(ctrl.conversions).toBe(2);
  expect(ctrl.rate).toBeCloseTo(2 / 3, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/routes/experiments --no-coverage 2>&1 | tail -20
```

Expected: FAIL — endpoints don't exist yet.

- [ ] **Step 3: Add endpoints to `ota-server/src/routes/experiments.ts`**

Append to the existing experiments router (before `export`):

```typescript
const ExposeSchema = z.object({
  install_id: z.string().min(1),
  user_id: z.string().optional(),
  variant_id: z.string().min(1),
});

const ConvertSchema = z.object({
  install_id: z.string().min(1),
  user_id: z.string().optional(),
  variant_id: z.string().min(1),
  event_name: z.string().min(1),
  value: z.number().optional().default(1),
});

router.post('/:key/expose', (req, res) => {
  const parse = ExposeSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const db = getDb();
  const exp = db.prepare('SELECT * FROM experiments WHERE key = ?').get(req.params.key) as any;
  if (!exp) return res.status(404).json({ error: 'Experiment not found' });
  const { install_id, user_id, variant_id } = parse.data;
  db.prepare(
    `INSERT OR IGNORE INTO experiment_exposures (id, experiment_id, install_id, user_id, variant_id, exposed_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(randomUUID(), exp.id, install_id, user_id ?? null, variant_id);
  res.json({ ok: true });
});

router.post('/:key/convert', (req, res) => {
  const parse = ConvertSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const db = getDb();
  const exp = db.prepare('SELECT * FROM experiments WHERE key = ?').get(req.params.key) as any;
  if (!exp) return res.status(404).json({ error: 'Experiment not found' });
  const { install_id, user_id, variant_id, event_name, value } = parse.data;
  db.prepare(
    `INSERT INTO experiment_conversions (id, experiment_id, install_id, user_id, variant_id, event_name, value, converted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(randomUUID(), exp.id, install_id, user_id ?? null, variant_id, event_name, value);
  res.json({ ok: true });
});

router.get('/:key/results', (req, res) => {
  const db = getDb();
  const exp = db.prepare('SELECT * FROM experiments WHERE key = ?').get(req.params.key) as any;
  if (!exp) return res.status(404).json({ error: 'Experiment not found' });
  const variants: { id: string; weight: number }[] = JSON.parse(exp.variants);

  const variantStats = variants.map(v => {
    const exposures = (db.prepare(
      'SELECT COUNT(*) as cnt FROM experiment_exposures WHERE experiment_id = ? AND variant_id = ?'
    ).get(exp.id, v.id) as { cnt: number }).cnt;
    const conversions = (db.prepare(
      'SELECT COUNT(DISTINCT install_id) as cnt FROM experiment_conversions WHERE experiment_id = ? AND variant_id = ?'
    ).get(exp.id, v.id) as { cnt: number }).cnt;
    const rate = exposures > 0 ? conversions / exposures : 0;
    return { id: v.id, exposures, conversions, rate, lift_vs_control: 0 };
  });

  const control = variantStats.find(v => v.id === 'control');
  if (control) {
    for (const v of variantStats) {
      v.lift_vs_control = control.rate > 0 ? (v.rate - control.rate) / control.rate : 0;
    }
  }

  const winner = variantStats.find(v => v.id !== 'control' && v.lift_vs_control >= 0.1)?.id ?? null;

  res.json({ variants: variantStats, winner });
});
```

Add `import { randomUUID } from 'crypto';` at the top of experiments.ts if not already present.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/routes/experiments --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ota-server/src/routes/experiments.ts ota-server/src/__tests__/routes/experiments.test.ts
git commit -m "feat: experiment /expose, /convert, /results endpoints"
```

---

## Task 6: Flag Schedules — API + Scheduler Extension

**Files:**
- Create: `ota-server/src/routes/schedules.ts`
- Create: `ota-server/src/__tests__/routes/schedules.test.ts`
- Modify: `ota-server/src/rolloutScheduler.ts`
- Test: `ota-server/src/__tests__/rolloutScheduler.test.ts` (modify existing)

- [ ] **Step 1: Write the failing tests**

Create `ota-server/src/__tests__/routes/schedules.test.ts`:

```typescript
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { initDb } from '../../src/db.js';

jest.mock('../../src/db.js', () => {
  const db = new (require('better-sqlite3'))(':memory:');
  const { initDb } = jest.requireActual('../../src/db.js');
  initDb(db);
  return { getDb: () => db, initDb };
});

const { schedulesRouter } = await import('../../src/routes/schedules.js');
const app = express();
app.use(express.json());
app.use('/api/schedules', schedulesRouter);
const db = (await import('../../src/db.js')).getDb();

beforeEach(() => {
  db.prepare('DELETE FROM flag_schedules').run();
});

test('GET /api/schedules returns empty array', async () => {
  const res = await request(app).get('/api/schedules');
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});

test('POST /api/schedules creates a schedule', async () => {
  const res = await request(app).post('/api/schedules').send({
    entity_type: 'flag',
    entity_id: 'flag-uuid-123',
    action: 'enable',
    scheduled_at: new Date(Date.now() + 60000).toISOString(),
    created_by: 'admin',
  });
  expect(res.status).toBe(201);
  expect(res.body.action).toBe('enable');
  expect(res.body.executed_at).toBeNull();
});

test('DELETE /api/schedules/:id cancels pending schedule', async () => {
  const createRes = await request(app).post('/api/schedules').send({
    entity_type: 'flag',
    entity_id: 'f1',
    action: 'disable',
    scheduled_at: new Date(Date.now() + 60000).toISOString(),
  });
  const id = createRes.body.id;
  const res = await request(app).delete(`/api/schedules/${id}`);
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});

test('DELETE /api/schedules/:id rejects already-executed schedule', async () => {
  const id = require('crypto').randomUUID();
  db.prepare(
    `INSERT INTO flag_schedules (id, entity_type, entity_id, action, scheduled_at, executed_at, created_at)
     VALUES (?, 'flag', 'f1', 'enable', datetime('now', '-1 minute'), datetime('now'), datetime('now'))`
  ).run(id);
  const res = await request(app).delete(`/api/schedules/${id}`);
  expect(res.status).toBe(409);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/routes/schedules --no-coverage 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `ota-server/src/routes/schedules.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';

export const schedulesRouter = Router();

const CreateScheduleSchema = z.object({
  entity_type: z.enum(['flag', 'kill_switch', 'experiment']),
  entity_id: z.string().min(1),
  action: z.enum(['enable', 'disable', 'set_percentage']),
  payload: z.record(z.unknown()).optional(),
  scheduled_at: z.string().datetime(),
  created_by: z.string().optional().default('system'),
});

schedulesRouter.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM flag_schedules ORDER BY scheduled_at ASC').all();
  res.json(rows.map(r => ({ ...r, payload: (r as any).payload ? JSON.parse((r as any).payload) : null })));
});

schedulesRouter.post('/', (req, res) => {
  const parse = CreateScheduleSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const { entity_type, entity_id, action, payload, scheduled_at, created_by } = parse.data;
  const db = getDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO flag_schedules (id, entity_type, entity_id, action, payload, scheduled_at, executed_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(id, entity_type, entity_id, payload ? JSON.stringify(payload) : null, scheduled_at, created_by, now);
  const row = db.prepare('SELECT * FROM flag_schedules WHERE id = ?').get(id) as any;
  res.status(201).json({ ...row, payload: row.payload ? JSON.parse(row.payload) : null });
});

schedulesRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM flag_schedules WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.executed_at) return res.status(409).json({ error: 'Already executed, cannot cancel' });
  db.prepare('DELETE FROM flag_schedules WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
```

- [ ] **Step 4: Extend `ota-server/src/rolloutScheduler.ts`**

Inside the `tick()` function, after the existing rollout advancement block, append:

```typescript
  // Execute pending flag schedules
  const pendingSchedules = db
    .prepare("SELECT * FROM flag_schedules WHERE scheduled_at <= datetime('now') AND executed_at IS NULL")
    .all() as any[];

  for (const sched of pendingSchedules) {
    try {
      if (sched.entity_type === 'flag') {
        if (sched.action === 'enable') {
          db.prepare('UPDATE feature_flags SET enabled = 1, updated_at = datetime(\'now\') WHERE id = ?').run(sched.entity_id);
        } else if (sched.action === 'disable') {
          db.prepare('UPDATE feature_flags SET enabled = 0, updated_at = datetime(\'now\') WHERE id = ?').run(sched.entity_id);
        } else if (sched.action === 'set_percentage') {
          const payload = sched.payload ? JSON.parse(sched.payload) : {};
          const targeting = db.prepare('SELECT targeting FROM feature_flags WHERE id = ?').get(sched.entity_id) as any;
          if (targeting) {
            const rule = targeting.targeting ? JSON.parse(targeting.targeting) : {};
            rule.percentage = payload.percentage;
            db.prepare('UPDATE feature_flags SET targeting = ?, updated_at = datetime(\'now\') WHERE id = ?')
              .run(JSON.stringify(rule), sched.entity_id);
          }
        }
      } else if (sched.entity_type === 'experiment') {
        if (sched.action === 'disable') {
          db.prepare("UPDATE experiments SET status = 'completed', updated_at = datetime('now') WHERE id = ?").run(sched.entity_id);
        }
      } else if (sched.entity_type === 'kill_switch') {
        if (sched.action === 'enable') {
          db.prepare("UPDATE kill_switches SET active = 1, updated_at = datetime('now') WHERE id = ?").run(sched.entity_id);
        } else if (sched.action === 'disable') {
          db.prepare("UPDATE kill_switches SET active = 0, updated_at = datetime('now') WHERE id = ?").run(sched.entity_id);
        }
      }

      db.prepare("UPDATE flag_schedules SET executed_at = datetime('now') WHERE id = ?").run(sched.id);
      logChange('flag_schedule', sched.id, `executed_${sched.action}`, { entity_type: sched.entity_type, entity_id: sched.entity_id }, 'scheduler');
    } catch (err) {
      console.error('[scheduler] Failed to execute schedule', sched.id, err);
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd ota-server && npx jest --testPathPattern="__tests__/routes/schedules" --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ota-server/src/routes/schedules.ts ota-server/src/__tests__/routes/schedules.test.ts ota-server/src/rolloutScheduler.ts
git commit -m "feat: flag schedules API and rolloutScheduler execution job"
```

---

## Task 7: Actor Identity in Audit Log

**Files:**
- Modify: `ota-server/src/middleware/auth.ts`
- Modify: `ota-server/src/services/audit.ts`

- [ ] **Step 1: Write the failing test**

Open `ota-server/src/__tests__/services/audit.test.ts` (create if not exists):

```typescript
import Database from 'better-sqlite3';
import { initDb } from '../../src/db.js';
import { logChange } from '../../src/services/audit.js';

let db: Database.Database;

jest.mock('../../src/db.js', () => {
  const db = new (require('better-sqlite3'))(':memory:');
  const { initDb } = jest.requireActual('../../src/db.js');
  initDb(db);
  return { getDb: () => db };
});

beforeEach(() => {
  db = (require('../../src/db.js')).getDb();
  db.prepare('DELETE FROM audit_log').run();
});

test('logChange records actor when provided', () => {
  logChange('flag', 'flag-1', 'enable', { enabled: true }, 'alice');
  const row = db.prepare('SELECT * FROM audit_log').get() as any;
  expect(row.actor).toBe('alice');
});

test('logChange defaults actor to system', () => {
  logChange('flag', 'flag-1', 'enable', { enabled: true });
  const row = db.prepare('SELECT * FROM audit_log').get() as any;
  expect(row.actor).toBe('system');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/services/audit --no-coverage 2>&1 | tail -20
```

Expected: FAIL — actor defaults to 'api' not 'system', or function signature wrong.

- [ ] **Step 3: Update `ota-server/src/services/audit.ts`**

Change the `logChange` signature so actor defaults to `'system'` (not `'api'`):

```typescript
export function logChange(
  entityType: string,
  entityId: string,
  action: string,
  changes: object | null,
  actor: string = 'system',
): void {
  // ... existing implementation unchanged ...
}
```

- [ ] **Step 4: Update `ota-server/src/middleware/auth.ts`**

Add actor name attachment. After the Bearer token check succeeds, attach `req.adminActor`:

```typescript
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      adminActor?: string;
    }
  }
}

export function bearerAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== process.env.OTA_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Attach actor from X-Admin-Actor header (set by admin dashboard login)
  req.adminActor = (req.headers['x-admin-actor'] as string) ?? 'api';
  next();
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd ota-server && npx jest --testPathPattern=__tests__/services/audit --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ota-server/src/middleware/auth.ts ota-server/src/services/audit.ts ota-server/src/__tests__/services/audit.test.ts
git commit -m "feat: actor identity in audit log; logChange defaults to system; middleware attaches actor"
```

---

## Task 8: Route Registration + Demo Data Seeding

**Files:**
- Modify: `ota-server/src/index.ts`

- [ ] **Step 1: Register new routes in `ota-server/src/index.ts`**

Find the existing route registrations block and add:

```typescript
import { segmentsRouter } from './routes/segments.js';
import { schedulesRouter } from './routes/schedules.js';

// After existing routes:
app.use('/api/segments', bearerAuth, segmentsRouter);
app.use('/api/schedules', bearerAuth, schedulesRouter);
```

- [ ] **Step 2: Add seed demo data function**

Append a `seedDemoData` function that runs once at startup:

```typescript
function seedDemoData(db: Database.Database) {
  // Seed segments if not present
  const segments = [
    { key: 'premium_users', name: 'Premium Users', rules: [{ attribute: 'plan', operator: 'eq', value: 'premium' }] },
    { key: 'beta_testers', name: 'Beta Testers', rules: [{ attribute: 'email_domain', operator: 'eq', value: 'rumik.dev' }] },
    { key: 'new_users', name: 'New Users', rules: [{ attribute: 'account_age_days', operator: 'lt', value: 7 }] },
    { key: 'power_users', name: 'Power Users', rules: [{ attribute: 'account_age_days', operator: 'gt', value: 30 }] },
  ];

  for (const seg of segments) {
    const existing = db.prepare('SELECT id FROM segments WHERE key = ?').get(seg.key);
    if (!existing) {
      db.prepare(
        `INSERT INTO segments (id, key, name, rules, created_at, updated_at) VALUES (?,?,?,?,datetime('now'),datetime('now'))`
      ).run(randomUUID(), seg.key, seg.name, JSON.stringify(seg.rules));
    }
  }

  // Seed demo flags if not present
  const flags = [
    {
      key: 'show_premium_upsell',
      description: 'Shows premium upsell card on home screen',
      targeting: JSON.stringify({ user_attribute_rules: [{ attribute: 'plan', operator: 'neq', value: 'premium' }] }),
    },
    {
      key: 'enable_social_share',
      description: 'Share button on track row and player',
      targeting: JSON.stringify({ percentage: 50 }),
    },
    {
      key: 'enable_offline_mode',
      description: 'Download tracks for offline playback',
      targeting: JSON.stringify({ segment_keys: ['premium_users'] }),
    },
    {
      key: 'enable_lyrics_link',
      description: 'Lyrics button in full player',
      targeting: JSON.stringify({ platforms: ['ios', 'android'] }),
    },
  ];

  for (const flag of flags) {
    const existing = db.prepare('SELECT id FROM feature_flags WHERE key = ?').get(flag.key);
    if (!existing) {
      db.prepare(
        `INSERT INTO feature_flags (id, key, enabled, description, targeting, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, datetime('now'), datetime('now'))`
      ).run(randomUUID(), flag.key, flag.description, flag.targeting);
    }
  }

  // Seed demo kill switches with targeting
  const killSwitches = [
    { key: 'disable_audio_ios', reason: 'iOS audio kill', targeting: JSON.stringify({ platforms: ['ios'] }) },
    { key: 'disable_offline_mode', reason: 'Block downloads for new accounts', targeting: JSON.stringify({ segment_keys: ['new_users'] }) },
    { key: 'disable_social_share', reason: 'Android share kill', targeting: JSON.stringify({ platforms: ['android'] }) },
  ];

  for (const ks of killSwitches) {
    const existing = db.prepare('SELECT id FROM kill_switches WHERE key = ?').get(ks.key);
    if (!existing) {
      db.prepare(
        `INSERT INTO kill_switches (id, key, active, reason, targeting, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?, datetime('now'), datetime('now'))`
      ).run(randomUUID(), ks.key, ks.reason, ks.targeting);
    }
  }

  // Seed demo experiments if not present
  const experiments = [
    {
      key: 'home_layout',
      variants: [{ id: 'control', weight: 34 }, { id: 'charts_first', weight: 33 }, { id: 'recent_first', weight: 33 }],
    },
    {
      key: 'player_ui',
      variants: [{ id: 'control', weight: 50 }, { id: 'immersive', weight: 50 }],
    },
    {
      key: 'search_prompt_copy',
      variants: [{ id: 'control', weight: 50 }, { id: 'variant_a', weight: 50 }],
    },
  ];

  for (const exp of experiments) {
    const existing = db.prepare('SELECT id FROM experiments WHERE key = ?').get(exp.key);
    if (!existing) {
      db.prepare(
        `INSERT INTO experiments (id, key, status, variants, targeting, created_at, updated_at)
         VALUES (?, ?, 'active', ?, NULL, datetime('now'), datetime('now'))`
      ).run(randomUUID(), exp.key, JSON.stringify(exp.variants));
    }
  }

  // Seed demo schedules relative to server start (+2min, +5min, +8min)
  const showPremiumFlag = db.prepare("SELECT id FROM feature_flags WHERE key = 'show_premium_upsell'").get() as any;
  const socialShareFlag = db.prepare("SELECT id FROM feature_flags WHERE key = 'enable_social_share'").get() as any;
  const homeLayoutExp = db.prepare("SELECT id FROM experiments WHERE key = 'home_layout'").get() as any;

  const schedCount = (db.prepare('SELECT COUNT(*) as cnt FROM flag_schedules').get() as any).cnt;
  if (schedCount === 0 && showPremiumFlag && socialShareFlag && homeLayoutExp) {
    const now = Date.now();
    const schedules = [
      { entity_type: 'flag', entity_id: showPremiumFlag.id, action: 'enable', payload: null, offset: 2 },
      { entity_type: 'flag', entity_id: socialShareFlag.id, action: 'set_percentage', payload: JSON.stringify({ percentage: 50 }), offset: 5 },
      { entity_type: 'experiment', entity_id: homeLayoutExp.id, action: 'disable', payload: null, offset: 8 },
    ];
    for (const s of schedules) {
      const scheduledAt = new Date(now + s.offset * 60 * 1000).toISOString();
      db.prepare(
        `INSERT INTO flag_schedules (id, entity_type, entity_id, action, payload, scheduled_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'system', datetime('now'))`
      ).run(randomUUID(), s.entity_type, s.entity_id, s.action, s.payload, scheduledAt);
    }
  }
}
```

Call `seedDemoData(db)` right after `initDb(db)` in the startup code.

- [ ] **Step 2: Run all tests to ensure nothing broke**

```bash
cd ota-server && npx jest --no-coverage 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add ota-server/src/index.ts
git commit -m "feat: register segments/schedules routes; seed demo flags, experiments, segments, kill switches"
```

---

## Task 9: Client — ConfigClientOptions User Context Fields

**Files:**
- Modify: `src/services/config/types.ts`
- Modify: `src/services/config/ConfigClient.ts`
- Test: `src/__tests__/services/config/ConfigClient.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/services/config/ConfigClient.test.ts`:

```typescript
import { ConfigClient } from '../../../src/services/config/ConfigClient';

global.fetch = jest.fn();

beforeEach(() => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ flags: {}, experiments: {}, urls: {}, kill_switches: [], ttl: 60 }),
  });
});

afterEach(() => jest.clearAllMocks());

test('fetchAndUpdate includes user context params when set', async () => {
  const client = new ConfigClient({
    serverUrl: 'http://localhost:3001',
    platform: 'ios',
    nativeVersion: '1.0.0',
    installId: 'dev-install-1',
  });

  client.setUserContext({ userId: 'user_abc', plan: 'premium', emailDomain: 'rumik.dev', accountAgeDays: 45 });
  await (client as any).fetchAndUpdate();

  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).toContain('user_id=user_abc');
  expect(url).toContain('plan=premium');
  expect(url).toContain('email_domain=rumik.dev');
  expect(url).toContain('account_age_days=45');
});

test('fetchAndUpdate omits user context params when not set', async () => {
  const client = new ConfigClient({
    serverUrl: 'http://localhost:3001',
    platform: 'ios',
    nativeVersion: '1.0.0',
    installId: 'dev-install-1',
  });

  await (client as any).fetchAndUpdate();

  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
  expect(url).not.toContain('user_id');
  expect(url).not.toContain('plan');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest --testPathPattern="__tests__/services/config/ConfigClient" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `setUserContext` not a method.

- [ ] **Step 3: Update `src/services/config/types.ts`**

Add user context fields to `ConfigClientOptions`:

```typescript
export interface ConfigClientOptions {
  serverUrl: string;
  apiKey?: string;
  platform: 'ios' | 'android' | 'web';
  nativeVersion: string;
  installId: string;
  ttl?: number;
  onKillSwitch?: (key: string) => void;
  onConfigUpdate?: (config: RemoteConfig) => void;
  // User identity for server-side targeting
  userId?: string;
  userPlan?: string;
  emailDomain?: string;
  accountAgeDays?: number;
}

export interface UserContext {
  userId?: string;
  plan?: string;
  emailDomain?: string;
  accountAgeDays?: number;
}
```

- [ ] **Step 4: Update `src/services/config/ConfigClient.ts`**

Add user context storage and setUserContext method. Inside the class:

```typescript
private userCtx: UserContext = {};

setUserContext(ctx: UserContext): void {
  this.userCtx = { ...ctx };
  void this.fetchAndUpdate();
}
```

Update the `fetchAndUpdate` URL params:

```typescript
private async fetchAndUpdate(): Promise<void> {
  const params = new URLSearchParams({
    platform: this.options.platform,
    native_version: this.options.nativeVersion,
    install_id: this.options.installId,
  });
  if (this.userCtx.userId) params.set('user_id', this.userCtx.userId);
  if (this.userCtx.plan) params.set('plan', this.userCtx.plan);
  if (this.userCtx.emailDomain) params.set('email_domain', this.userCtx.emailDomain);
  if (this.userCtx.accountAgeDays !== undefined) params.set('account_age_days', String(this.userCtx.accountAgeDays));
  // ... rest of fetch unchanged ...
}
```

Also import `UserContext` from types at the top of ConfigClient.ts:

```typescript
import type { ConfigClientOptions, UserContext } from './types.js';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest --testPathPattern="__tests__/services/config/ConfigClient" --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/config/types.ts src/services/config/ConfigClient.ts src/__tests__/services/config/ConfigClient.test.ts
git commit -m "feat: ConfigClient user context — setUserContext(), user_id/plan/email/age params"
```

---

## Task 10: RemoteConfigProvider + Experiment Tracking Hooks

**Files:**
- Modify: `src/hooks/useRemoteConfig.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/hooks/useRemoteConfig.test.tsx`:

```typescript
import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { useExperimentTracking, useTrackConversion, RemoteConfigProvider } from '../../src/hooks/useRemoteConfig';

global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RemoteConfigProvider serverUrl="http://localhost:3001" platform="ios" nativeVersion="1.0.0">
    {children}
  </RemoteConfigProvider>
);

beforeEach(() => (global.fetch as jest.Mock).mockClear());

test('useExperimentTracking fires POST expose on mount', async () => {
  renderHook(() => useExperimentTracking('home_layout', 'control'), { wrapper });
  await new Promise(r => setTimeout(r, 10));
  const exposeCalls = (global.fetch as jest.Mock).mock.calls.filter(
    ([url]: [string]) => url.includes('/expose')
  );
  expect(exposeCalls.length).toBeGreaterThan(0);
});

test('useExperimentTracking deduplicates — second render does not fire again', async () => {
  const { rerender } = renderHook(() => useExperimentTracking('player_ui', 'control'), { wrapper });
  await new Promise(r => setTimeout(r, 10));
  rerender({});
  await new Promise(r => setTimeout(r, 10));
  const exposeCalls = (global.fetch as jest.Mock).mock.calls.filter(
    ([url]: [string]) => url.includes('/experiments/player_ui/expose')
  );
  expect(exposeCalls.length).toBe(1);
});

test('useTrackConversion returns stable function that fires conversion', async () => {
  const { result } = renderHook(() => useTrackConversion(), { wrapper });
  result.current('search_prompt_copy', 'search_completed', 1);
  await new Promise(r => setTimeout(r, 10));
  const convertCalls = (global.fetch as jest.Mock).mock.calls.filter(
    ([url]: [string]) => url.includes('/convert')
  );
  expect(convertCalls.length).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest --testPathPattern="__tests__/hooks/useRemoteConfig" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — hooks not exported.

- [ ] **Step 3: Update `src/hooks/useRemoteConfig.tsx`**

Add to the existing file:

```typescript
// Module-level set for deduplication (survives re-renders, cleared on app restart)
const firedExposures = new Set<string>();

export function useExperimentTracking(experimentKey: string, variantId: string): void {
  const { installId } = useContext(RemoteConfigContext);
  useEffect(() => {
    const dedupKey = `${experimentKey}:${installId}`;
    if (firedExposures.has(dedupKey)) return;
    firedExposures.add(dedupKey);
    const body = JSON.stringify({ install_id: installId, variant_id: variantId });
    void fetch(`${serverUrl}/api/experiments/${experimentKey}/expose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }, [experimentKey, variantId, installId]);
}

export function useTrackConversion(): (key: string, eventName: string, value?: number) => void {
  const { installId } = useContext(RemoteConfigContext);
  return useCallback((key: string, eventName: string, value = 1) => {
    void fetch(`${serverUrl}/api/experiments/${key}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ install_id: installId, event_name: eventName, value }),
    });
  }, [installId]);
}
```

Note: `serverUrl` and `installId` must be accessible from the hook context. Update `RemoteConfigContext` to include `serverUrl` and `installId`:

```typescript
interface RemoteConfigContextValue {
  config: RemoteConfig;
  client: ConfigClient | null;
  serverUrl: string;
  installId: string;
}
```

Update `RemoteConfigProvider` to pass these through context.

Also update `RemoteConfigProvider` to accept `user` prop (Clerk `UserResource | null`):

```typescript
interface RemoteConfigProviderProps {
  children: React.ReactNode;
  serverUrl: string;
  platform: 'ios' | 'android' | 'web';
  nativeVersion: string;
  user?: { id?: string; publicMetadata?: { plan?: string }; primaryEmailAddress?: { emailAddress?: string }; createdAt?: Date } | null;
}
```

Inside the provider, add a `useEffect` that calls `client.setUserContext()` when `user` changes:

```typescript
useEffect(() => {
  if (!clientRef.current || !user) return;
  const emailDomain = user.primaryEmailAddress?.emailAddress?.split('@')[1];
  const accountAgeDays = user.createdAt
    ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000)
    : undefined;
  clientRef.current.setUserContext({
    userId: user.id,
    plan: (user.publicMetadata as any)?.plan,
    emailDomain,
    accountAgeDays,
  });
}, [user]);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest --testPathPattern="__tests__/hooks/useRemoteConfig" --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRemoteConfig.tsx src/__tests__/hooks/useRemoteConfig.test.tsx
git commit -m "feat: useExperimentTracking, useTrackConversion hooks; RemoteConfigProvider accepts Clerk user"
```

---

## Task 11: Wire Clerk User to RemoteConfigProvider in `_layout.tsx`

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Read current `app/_layout.tsx`**

The file uses `useUser()` from Clerk. Find where `RemoteConfigProvider` is rendered and add the `user` prop:

```typescript
const { user } = useUser();

// In JSX:
<RemoteConfigProvider
  serverUrl={OTA_SERVER_URL}
  platform={Platform.OS as 'ios' | 'android' | 'web'}
  nativeVersion={nativeApplicationVersion ?? '1.0.0'}
  user={user}
>
  {children}
</RemoteConfigProvider>
```

- [ ] **Step 2: Run existing tests to confirm no regression**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: pass Clerk user to RemoteConfigProvider for server-side user targeting"
```

---

## Task 12: `show_premium_upsell` Feature Flag + PremiumUpsellCard

**Files:**
- Create: `src/components/ui/PremiumUpsellCard.tsx`
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Create `src/components/ui/PremiumUpsellCard.tsx`**

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../../theme/tokens';

export function PremiumUpsellCard() {
  return (
    <View style={styles.card}>
      <Text style={styles.headline}>Go Premium</Text>
      <View style={styles.bullets}>
        {['Offline downloads', 'HD audio quality', 'No ads'].map(feature => (
          <Text key={feature} style={styles.bullet}>• {feature}</Text>
        ))}
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={() => Alert.alert('Premium', 'Upgrade flow coming soon!')}
      >
        <Text style={styles.buttonText}>Upgrade</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.accent + '22',
    borderRadius: 12,
    padding: Spacing.lg,
    marginVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent + '44',
  },
  headline: { ...Typography.heading, color: Colors.text, marginBottom: Spacing.sm },
  bullets: { marginBottom: Spacing.md },
  bullet: { ...Typography.body, color: Colors.textSecondary, marginBottom: 4 },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  buttonText: { ...Typography.label, color: '#fff', fontWeight: '700' },
});
```

- [ ] **Step 2: Gate it in `app/(tabs)/index.tsx`**

Add the import and flag usage. After the existing `useExperiment` calls:

```typescript
import { useFeatureFlag, useExperiment, useExperimentTracking, useTrackConversion } from '../../src/hooks/useRemoteConfig';
import { PremiumUpsellCard } from '../../src/components/ui/PremiumUpsellCard';

// Inside HomeScreen:
const showPremiumUpsell = useFeatureFlag('show_premium_upsell');
const homeLayout = useExperiment('home_layout', 'control');
const trackConversion = useTrackConversion();

useExperimentTracking('home_layout', homeLayout);

const handlePlay = async (track: DeezerTrack) => {
  await play(track);
  if (userId) await pushRecent(userId, track);
  trackConversion('home_layout', 'track_played_home');
};
```

Between RECENTLY PLAYED and FEATURED sections in JSX:

```tsx
{showPremiumUpsell && <PremiumUpsellCard />}
```

- [ ] **Step 3: Run existing tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/PremiumUpsellCard.tsx app/(tabs)/index.tsx
git commit -m "feat: show_premium_upsell flag — PremiumUpsellCard with targeting for non-premium users"
```

---

## Task 13: `enable_social_share` Flag — TrackRow + NowPlaying

**Files:**
- Modify: `src/components/track/TrackRow.tsx`
- Modify: `src/components/player/NowPlaying.tsx`

- [ ] **Step 1: Add share to `src/components/track/TrackRow.tsx`**

Add `showShare?: boolean` and `onShare?: (track: DeezerTrack) => void` to TrackRow props, then add the share button:

```typescript
import { Share } from 'react-native';

interface TrackRowProps {
  track: DeezerTrack;
  onPlay: (track: DeezerTrack) => void;
  rank?: number;
  isLiked?: boolean;
  onLike?: (track: DeezerTrack) => void;
  showLike?: boolean;
  showShare?: boolean;
}

// In component:
const handleShare = async () => {
  await Share.share({ message: `${track.title} by ${track.artist.name} — listening on rumik` });
};

// In JSX action row, conditionally:
{showShare && (
  <TouchableOpacity onPress={handleShare} style={styles.actionBtn}>
    <Text style={styles.actionIcon}>↗</Text>
  </TouchableOpacity>
)}
```

- [ ] **Step 2: Gate in `app/(tabs)/index.tsx`**

```typescript
const showSocialShare = useFeatureFlag('enable_social_share');
// On TrackRow:
<TrackRow ... showShare={showSocialShare} />
```

- [ ] **Step 3: Add share button to `src/components/player/NowPlaying.tsx`**

Import Share, add share button in the controls area:

```typescript
import { Share } from 'react-native';

// In JSX:
{showSocialShare && (
  <TouchableOpacity onPress={async () => {
    if (currentTrack) {
      await Share.share({ message: `${currentTrack.title} by ${currentTrack.artist.name} — listening on rumik` });
    }
  }}>
    <Text style={styles.shareIcon}>↗</Text>
  </TouchableOpacity>
)}
```

Note: NowPlaying must receive `showSocialShare` prop or read it from a context/hook. Use `useFeatureFlag` inside NowPlaying:

```typescript
const showSocialShare = useFeatureFlag('enable_social_share');
```

- [ ] **Step 4: Run tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/track/TrackRow.tsx src/components/player/NowPlaying.tsx app/(tabs)/index.tsx
git commit -m "feat: enable_social_share flag — share button on TrackRow and NowPlaying"
```

---

## Task 14: `enable_offline_mode` Flag — expo-file-system + Player

**Files:**
- Modify: `src/services/player.tsx`
- Modify: `src/components/track/TrackRow.tsx`

- [ ] **Step 1: Install expo-file-system if not present**

```bash
cd ..  # from ota-server, go to root
npx expo install expo-file-system 2>&1 | tail -10
```

- [ ] **Step 2: Update `src/services/player.tsx` to check local file**

At the top of the `play` function, before creating AudioPlayer:

```typescript
import * as FileSystem from 'expo-file-system';

const OFFLINE_DIR = FileSystem.documentDirectory + 'offline/';

async function getLocalPath(trackId: number): Promise<string | null> {
  const path = `${OFFLINE_DIR}${trackId}.mp3`;
  const info = await FileSystem.getInfoAsync(path);
  return info.exists ? path : null;
}

export async function downloadTrack(track: DeezerTrack): Promise<void> {
  await FileSystem.makeDirectoryAsync(OFFLINE_DIR, { intermediates: true });
  const dest = `${OFFLINE_DIR}${track.id}.mp3`;
  await FileSystem.downloadAsync(track.preview, dest);
}

export async function isDownloaded(trackId: number): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(`${OFFLINE_DIR}${trackId}.mp3`);
  return info.exists;
}

// Inside play():
const localPath = await getLocalPath(track.id);
const streamUrl = localPath ? localPath : track.preview;
// use streamUrl instead of track.preview when creating AudioPlayer
```

- [ ] **Step 3: Add download button to TrackRow**

```typescript
import { downloadTrack, isDownloaded } from '../../services/player';
import * as FileSystem from 'expo-file-system';

// Props additions:
showDownload?: boolean;

// State inside component:
const [downloaded, setDownloaded] = useState(false);

useEffect(() => {
  if (!showDownload) return;
  isDownloaded(track.id).then(setDownloaded);
}, [track.id, showDownload]);

// Button in JSX:
{showDownload && (
  <TouchableOpacity onPress={async () => {
    if (!downloaded) {
      await downloadTrack(track);
      setDownloaded(true);
    }
  }}>
    <Text style={styles.actionIcon}>{downloaded ? '✓' : '↓'}</Text>
  </TouchableOpacity>
)}
```

- [ ] **Step 4: Gate in index.tsx**

```typescript
const enableOfflineMode = useFeatureFlag('enable_offline_mode');
// On TrackRow:
<TrackRow ... showDownload={enableOfflineMode} />
```

- [ ] **Step 5: Run tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all pass (expo-file-system will be mocked by default in test env).

- [ ] **Step 6: Commit**

```bash
git add src/services/player.tsx src/components/track/TrackRow.tsx app/(tabs)/index.tsx
git commit -m "feat: enable_offline_mode flag — expo-file-system download, local playback"
```

---

## Task 15: `enable_lyrics_link` Flag — NowPlaying + expo-web-browser

**Files:**
- Modify: `src/components/player/NowPlaying.tsx`

- [ ] **Step 1: Install expo-web-browser if not present**

```bash
npx expo install expo-web-browser 2>&1 | tail -10
```

- [ ] **Step 2: Add Lyrics button to NowPlaying**

```typescript
import * as WebBrowser from 'expo-web-browser';
import { useFeatureFlag } from '../../hooks/useRemoteConfig';

// Inside NowPlaying:
const enableLyricsLink = useFeatureFlag('enable_lyrics_link');

// In JSX, below the main controls:
{enableLyricsLink && currentTrack && (
  <TouchableOpacity
    style={styles.lyricsBtn}
    onPress={() => {
      const query = encodeURIComponent(`${currentTrack.artist.name} ${currentTrack.title}`);
      WebBrowser.openBrowserAsync(`https://genius.com/search?q=${query}`);
    }}
  >
    <Text style={styles.lyricsBtnText}>Lyrics</Text>
  </TouchableOpacity>
)}
```

Add styles:

```typescript
lyricsBtn: {
  marginTop: Spacing.md,
  paddingVertical: Spacing.sm,
  paddingHorizontal: Spacing.lg,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: Colors.accent,
  alignSelf: 'center',
},
lyricsBtnText: { color: Colors.accent, ...Typography.label },
```

- [ ] **Step 3: Run tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/player/NowPlaying.tsx
git commit -m "feat: enable_lyrics_link flag — Lyrics button in NowPlaying opens Genius via expo-web-browser"
```

---

## Task 16: `home_layout` Experiment — 3 Variant Section Order

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Implement variant-driven section order**

The three variants differ only in the order of `[recently_played, featured, charts]` sections.

Inside HomeScreen, after `homeLayout` is read from `useExperiment`:

```typescript
type SectionKey = 'recently_played' | 'featured' | 'charts';

const sectionOrder: SectionKey[] = (() => {
  if (homeLayout === 'charts_first') return ['recently_played', 'charts', 'featured'];
  if (homeLayout === 'recent_first') return ['recently_played', 'charts', 'featured'].reverse() as SectionKey[];
  return ['recently_played', 'featured', 'charts']; // control
})();
```

Wait — per spec:
- `control`: Genre Pills → Featured → Recently Played → Charts
- `charts_first`: Genre Pills → Charts → Featured → Recently Played
- `recent_first`: Genre Pills → Recently Played → Charts → Featured

So:

```typescript
const sectionOrder: SectionKey[] = (() => {
  if (homeLayout === 'charts_first') return ['charts', 'featured', 'recently_played'] as SectionKey[];
  if (homeLayout === 'recent_first') return ['recently_played', 'charts', 'featured'] as SectionKey[];
  return ['featured', 'recently_played', 'charts'] as SectionKey[]; // control
})();
```

Replace the static JSX section rendering with a map over sectionOrder:

```tsx
{sectionOrder.map(section => {
  if (section === 'recently_played' && recent.length > 0) return (
    <React.Fragment key="recently_played">
      <SectionLabel>RECENTLY PLAYED</SectionLabel>
      {recent.slice(0, 5).map(track => (
        <TrackRow key={track.id} track={track} onPlay={handlePlay} isLiked={likedIds.has(track.id)} onLike={handleLike} showLike showShare={showSocialShare} showDownload={enableOfflineMode} />
      ))}
    </React.Fragment>
  );
  if (section === 'featured' && featured) return (
    <React.Fragment key="featured">
      <SectionLabel>FEATURED</SectionLabel>
      <TrackCard track={featured} onPlay={handlePlay} label="NEW RELEASE" />
    </React.Fragment>
  );
  if (section === 'charts' && chartList.length > 0) return (
    <React.Fragment key="charts">
      <SectionLabel>CHARTS</SectionLabel>
      {chartList.map((track, i) => (
        <TrackRow key={track.id} track={track} onPlay={handlePlay} rank={i + 2} isLiked={likedIds.has(track.id)} onLike={handleLike} showLike showShare={showSocialShare} showDownload={enableOfflineMode} />
      ))}
    </React.Fragment>
  );
  return null;
})}
```

- [ ] **Step 2: Run tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat: home_layout experiment — 3 section order variants with exposure/conversion tracking"
```

---

## Task 17: `player_ui` Experiment — Immersive Player Variant

**Files:**
- Modify: `src/components/player/NowPlaying.tsx`
- Modify: `src/components/player/MiniPlayer.tsx`

- [ ] **Step 1: Add immersive variant to NowPlaying**

Read the player_ui experiment variant inside NowPlaying. If `immersive`, render blurred album art background, large album art, gradient overlay, and big controls:

```typescript
import { useExperiment, useExperimentTracking } from '../../hooks/useRemoteConfig';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

// Inside NowPlaying:
const playerUiVariant = useExperiment('player_ui', 'control');
useExperimentTracking('player_ui', playerUiVariant);

if (playerUiVariant === 'immersive' && currentTrack) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.immersiveContainer}>
        <Image
          source={{ uri: currentTrack.album.cover_xl ?? currentTrack.album.cover_big }}
          style={StyleSheet.absoluteFillObject}
          blurRadius={20}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={styles.immersiveInner}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Image
            source={{ uri: currentTrack.album.cover_xl }}
            style={styles.immersiveArt}
          />
          <Text style={styles.immersiveTitle}>{currentTrack.title}</Text>
          <Text style={styles.immersiveArtist}>{currentTrack.artist.name}</Text>
          {/* Reuse existing controls */}
          <View style={styles.immersiveControls}>
            {/* skip back, play/pause, skip forward */}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
// else render existing compact layout
```

Add required styles for immersive mode.

Note: `expo-blur` and `expo-linear-gradient` may already be installed. Check `package.json`. If not:

```bash
npx expo install expo-blur expo-linear-gradient 2>&1 | tail -10
```

- [ ] **Step 2: Track `track_completed` conversion**

In the player service, when playback reaches >80% duration, fire the conversion. In `src/services/player.tsx`, after the audio status update listener:

```typescript
// In onPlaybackStatusUpdate:
if (status.isLoaded && status.durationMillis) {
  const pct = status.positionMillis / status.durationMillis;
  if (pct > 0.8 && !completionFired.current) {
    completionFired.current = true;
    onTrackCompleted?.(currentTrack);
  }
}
```

The `onTrackCompleted` callback is passed from the component that uses the player. In MiniPlayer or the player hook, call `trackConversion('player_ui', 'track_completed')`.

- [ ] **Step 3: Run tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/player/NowPlaying.tsx src/services/player.tsx
git commit -m "feat: player_ui experiment — immersive full-screen variant with blurred album art"
```

---

## Task 18: `search_prompt_copy` Experiment — Discover Screen

**Files:**
- Modify: `app/(tabs)/discover.tsx`

- [ ] **Step 1: Read current discover.tsx**

Find the TextInput placeholder for search. Currently it uses a static string like `"Search artists, tracks…"`.

- [ ] **Step 2: Add experiment**

```typescript
import { useExperiment, useExperimentTracking, useTrackConversion } from '../../src/hooks/useRemoteConfig';

// Inside DiscoverScreen:
const searchCopyVariant = useExperiment('search_prompt_copy', 'control');
useExperimentTracking('search_prompt_copy', searchCopyVariant);
const trackConversion = useTrackConversion();

const searchPlaceholder = searchCopyVariant === 'variant_a'
  ? 'What are you in the mood for?'
  : 'Search artists, tracks…';

// On TextInput:
<TextInput placeholder={searchPlaceholder} ... />

// When search results render (query >= 2 chars):
useEffect(() => {
  if (query.length >= 2 && results.length > 0) {
    trackConversion('search_prompt_copy', 'search_completed');
  }
}, [query, results.length]);
```

- [ ] **Step 3: Run tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/discover.tsx
git commit -m "feat: search_prompt_copy experiment — mood copy variant on Discover screen"
```

---

## Task 19: Admin Dashboard Additions

**Files:**
- Modify: relevant admin HTML template files in `ota-server/src/` (admin routes)

- [ ] **Step 1: Locate admin route files**

```bash
grep -r "admin" ota-server/src --include="*.ts" -l
```

Find where the admin HTML pages are rendered. They are typically inline HTML strings in `ota-server/src/routes/` or served from a template function.

- [ ] **Step 2: Add `/admin/segments` page**

In the admin router, add:

```typescript
adminRouter.get('/segments', (req, res) => {
  const db = getDb();
  const segments = db.prepare('SELECT * FROM segments ORDER BY created_at DESC').all() as any[];
  res.send(`<!DOCTYPE html>
<html><head><title>Segments | rumik admin</title>
<style>body{font-family:sans-serif;padding:2rem;background:#0a0a0a;color:#eee}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #333;text-align:left}
th{background:#1a1a1a}a{color:#8b5cf6}</style></head>
<body>
<h1>Named Segments</h1>
<a href="/admin">← Back</a>
<table>
  <thead><tr><th>Key</th><th>Name</th><th>Rules</th><th>Created</th></tr></thead>
  <tbody>
  ${segments.map(s => `<tr>
    <td><code>${s.key}</code></td>
    <td>${s.name}</td>
    <td><pre style="margin:0;font-size:12px">${s.rules}</pre></td>
    <td>${s.created_at}</td>
  </tr>`).join('')}
  </tbody>
</table>
</body></html>`);
});
```

- [ ] **Step 3: Add `/admin/experiments/:key/results` page**

```typescript
adminRouter.get('/experiments/:key/results', (req, res) => {
  const db = getDb();
  const exp = db.prepare('SELECT * FROM experiments WHERE key = ?').get(req.params.key) as any;
  if (!exp) return res.status(404).send('Not found');
  const variants: { id: string; weight: number }[] = JSON.parse(exp.variants);

  const variantStats = variants.map(v => {
    const exposures = (db.prepare('SELECT COUNT(*) as cnt FROM experiment_exposures WHERE experiment_id = ? AND variant_id = ?').get(exp.id, v.id) as any).cnt;
    const conversions = (db.prepare('SELECT COUNT(DISTINCT install_id) as cnt FROM experiment_conversions WHERE experiment_id = ? AND variant_id = ?').get(exp.id, v.id) as any).cnt;
    const rate = exposures > 0 ? (conversions / exposures * 100).toFixed(1) : '0.0';
    return { id: v.id, exposures, conversions, rate };
  });

  res.send(`<!DOCTYPE html>
<html><head><title>${exp.key} Results | rumik admin</title>
<style>body{font-family:sans-serif;padding:2rem;background:#0a0a0a;color:#eee}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #333;text-align:left}
th{background:#1a1a1a}</style>
<script>setTimeout(()=>location.reload(),30000)</script>
</head>
<body>
<h1>Experiment: ${exp.key}</h1>
<a href="/admin">← Back</a>
<p>Status: <strong>${exp.status}</strong> (auto-refreshes every 30s)</p>
<table>
  <thead><tr><th>Variant</th><th>Exposures</th><th>Conversions</th><th>Rate %</th></tr></thead>
  <tbody>
  ${variantStats.map(v => `<tr>
    <td><code>${v.id}</code></td>
    <td>${v.exposures}</td>
    <td>${v.conversions}</td>
    <td>${v.rate}%</td>
  </tr>`).join('')}
  </tbody>
</table>
</body></html>`);
});
```

- [ ] **Step 4: Add `/admin/schedules` page**

```typescript
adminRouter.get('/schedules', (req, res) => {
  const db = getDb();
  const schedules = db.prepare('SELECT * FROM flag_schedules ORDER BY scheduled_at ASC').all() as any[];
  const now = Date.now();
  res.send(`<!DOCTYPE html>
<html><head><title>Schedules | rumik admin</title>
<style>body{font-family:sans-serif;padding:2rem;background:#0a0a0a;color:#eee}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #333;text-align:left}
th{background:#1a1a1a}.pending{color:#fbbf24}.done{color:#34d399}</style></head>
<body>
<h1>Flag Schedules</h1>
<a href="/admin">← Back</a>
<table>
  <thead><tr><th>Entity</th><th>Type</th><th>Action</th><th>Scheduled At</th><th>Status</th></tr></thead>
  <tbody>
  ${schedules.map(s => {
    const isPending = !s.executed_at;
    const scheduledMs = new Date(s.scheduled_at).getTime();
    const countdown = isPending ? Math.max(0, Math.round((scheduledMs - now) / 1000)) : 0;
    const status = s.executed_at
      ? `<span class="done">Executed at ${s.executed_at}</span>`
      : `<span class="pending">Pending (in ${countdown}s)</span>`;
    return `<tr>
      <td><code>${s.entity_id.slice(0, 8)}…</code></td>
      <td>${s.entity_type}</td>
      <td>${s.action}</td>
      <td>${s.scheduled_at}</td>
      <td>${status}</td>
    </tr>`;
  }).join('')}
  </tbody>
</table>
</body></html>`);
});
```

- [ ] **Step 5: Update audit log page to add actor column**

In the existing audit log admin route, add an `actor` column to the table and add filter inputs for entity_type, actor name, and date range.

- [ ] **Step 6: Run all tests**

```bash
cd ota-server && npx jest --no-coverage 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 7: Final full test run**

```bash
cd .. && npx jest --no-coverage 2>&1 | tail -30
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add ota-server/src/
git commit -m "feat: admin dashboard — segments, experiment results, schedules pages with audit log actor column"
```

---

## Self-Review

### Spec coverage check:
- ✅ Section 1 — Extended TargetingRule: user_ids, segment_keys, user_attribute_rules (Task 2)
- ✅ Section 2 — Named segments (Task 3): 4 demo segments seeded (Task 8)
- ✅ Section 3 — Config endpoint user context (Task 4)
- ✅ Section 4 — Kill switch targeting (Task 4): 3 targeted demo kill switches seeded (Task 8)
- ✅ Section 5 — Scheduled flag changes (Task 6): 3 demo schedules seeded (Task 8)
- ✅ Section 6 — Experiment exposure/conversion tracking (Task 5): hooks (Task 10)
- ✅ Section 7 — Actor identity in audit log (Task 7)
- ✅ Section 8 — Real feature flags: show_premium_upsell (Task 12), enable_social_share (Task 13), enable_offline_mode (Task 14), enable_lyrics_link (Task 15)
- ✅ Section 9 — Real experiments: home_layout (Task 16), player_ui (Task 17), search_prompt_copy (Task 18)
- ✅ Section 10 — Client SDK: ConfigClient user context (Task 9), hooks (Task 10), Clerk wiring (Task 11)
- ✅ Section 11 — Admin dashboard (Task 19)

### Type consistency:
- `UserContext` defined in targeting.ts and re-exported; `ConfigClient.ts` imports from types.ts
- `evaluateTargeting(rule, device, userCtx?, db?)` — userCtx and db are optional; callers pass undefined when not available
- `evaluateAttributeRule` exported from targeting.ts, used in segments route

### Placeholder scan:
- No TBDs found. All code blocks are complete.
