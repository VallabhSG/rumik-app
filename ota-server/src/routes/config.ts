import { Router } from 'express';
import { z } from 'zod';
import db from '../db.js';
import { djb2 } from '../utils/hash.js';
import { evaluateTargeting, parseTargeting } from '../services/targeting.js';
import type { DeviceContext, UserContext } from '../services/targeting.js';

const router = Router();

const QuerySchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  native_version: z.string().min(1),
  install_id: z.string().min(1),
  user_id: z.string().optional(),
  plan: z.string().optional(),
  email_domain: z.string().optional(),
  account_age_days: z.coerce.number().optional(),
});

interface FlagRow { id: string; key: string; enabled: number; targeting: string | null; }
interface ExperimentRow { id: string; key: string; status: string; variants: string; targeting: string | null; }
interface UrlRow { id: string; key: string; value: string; targeting: string | null; }
interface KillSwitchRow { id: string; key: string; active: number; percentage: number; targeting: string | null; }
interface AssignmentRow { variant_id: string; }

/**
 * GET /api/config
 * Returns a fully-resolved config snapshot for the given device context.
 * All targeting rules are evaluated server-side.
 */
router.get('/', (req, res) => {
  const result = QuerySchema.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.flatten() });
  }
  const { platform, native_version, install_id, user_id, plan, email_domain, account_age_days } = result.data;

  const userCtx: UserContext = {
    userId: user_id,
    plan,
    email_domain,
    account_age_days,
  };

  // ── Feature flags ──────────────────────────────────────────────────────────
  const flagRows = db.prepare('SELECT id, key, enabled, targeting FROM feature_flags').all() as FlagRow[];
  const flags: Record<string, boolean> = {};
  for (const flag of flagRows) {
    const rule = parseTargeting(flag.targeting);
    const deviceCtx: DeviceContext = { platform, nativeVersion: native_version, installId: install_id, entityKey: flag.key };
    flags[flag.key] = flag.enabled === 1 && evaluateTargeting(rule, deviceCtx, userCtx, db);
  }

  // ── Experiments ────────────────────────────────────────────────────────────
  const expRows = db.prepare("SELECT id, key, status, variants, targeting FROM experiments WHERE status = 'active'").all() as ExperimentRow[];
  const experiments: Record<string, string> = {};
  for (const exp of expRows) {
    const ctx: DeviceContext = { platform, nativeVersion: native_version, installId: install_id, entityKey: exp.key };
    if (!evaluateTargeting(parseTargeting(exp.targeting), ctx, userCtx, db)) continue;

    // Check for existing stable assignment
    const existing = db.prepare(
      'SELECT variant_id FROM experiment_assignments WHERE install_id = ? AND experiment_id = ?'
    ).get(install_id, exp.id) as AssignmentRow | undefined;

    if (existing) {
      experiments[exp.key] = existing.variant_id;
      continue;
    }

    // Assign variant using weighted DJB2 bucketing
    const variants = JSON.parse(exp.variants) as Array<{ id: string; weight: number }>;
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight <= 0) continue;

    const bucket = djb2(install_id + exp.key) % totalWeight;
    let cumulative = 0;
    let assignedVariant = variants[0].id;
    for (const v of variants) {
      cumulative += v.weight;
      if (bucket < cumulative) { assignedVariant = v.id; break; }
    }

    // Persist the assignment so it's stable across weight changes
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO experiment_assignments (install_id, experiment_id, variant_id, assigned_at) VALUES (?, ?, ?, ?)'
    ).run(install_id, exp.id, assignedVariant, now);

    experiments[exp.key] = assignedVariant;
  }

  // ── Dynamic URLs ──────────────────────────────────────────────────────────
  const urlRows = db.prepare('SELECT id, key, value, targeting FROM dynamic_urls').all() as UrlRow[];
  const urls: Record<string, string> = {};
  for (const url of urlRows) {
    const ctx: DeviceContext = { platform, nativeVersion: native_version, installId: install_id, entityKey: url.key };
    if (evaluateTargeting(parseTargeting(url.targeting), ctx, userCtx, db)) {
      urls[url.key] = url.value;
    }
  }

  // ── Kill switches ─────────────────────────────────────────────────────────
  // Only active kill switches whose targeting rule matches the current device/user are returned.
  // If percentage < 100, apply DJB2 bucketing to limit rollout to that fraction of installs.
  const ksRows = db.prepare('SELECT key, active, percentage, targeting FROM kill_switches WHERE active = 1').all() as KillSwitchRow[];
  const kill_switches: string[] = [];
  for (const ks of ksRows) {
    const pct = ks.percentage ?? 100;
    if (pct < 100 && djb2(install_id + ks.key) % 100 >= pct) continue;
    const rule = parseTargeting(ks.targeting);
    const deviceCtx: DeviceContext = { platform, nativeVersion: native_version, installId: install_id, entityKey: ks.key };
    if (!rule || evaluateTargeting(rule, deviceCtx, userCtx, db)) {
      kill_switches.push(ks.key);
    }
  }

  // ── Version fingerprint ───────────────────────────────────────────────────
  const ttl = Number(process.env.CONFIG_TTL_SECONDS ?? 300);
  const responseData = { flags, experiments, urls, kill_switches, ttl };
  const version = djb2(JSON.stringify(responseData)).toString(16);

  return res.json({ success: true, data: { ...responseData, version } });
});

// GET /api/config/snapshot — raw (untargeted) export of all config for admin download
router.get('/snapshot', (_req, res) => {
  const flags = (db.prepare('SELECT key, enabled, description, targeting FROM feature_flags ORDER BY key ASC').all() as FlagRow[])
    .map(f => ({ key: f.key, enabled: f.enabled === 1, targeting: f.targeting ? JSON.parse(f.targeting) : null }));

  const experiments = (db.prepare('SELECT key, status, variants, targeting FROM experiments ORDER BY key ASC').all() as ExperimentRow[])
    .map(e => ({ key: e.key, status: e.status, variants: JSON.parse(e.variants) as unknown, targeting: e.targeting ? JSON.parse(e.targeting) : null }));

  const kill_switches = (db.prepare('SELECT key, active, percentage, targeting FROM kill_switches ORDER BY key ASC').all() as KillSwitchRow[])
    .map(k => ({ key: k.key, active: k.active === 1, percentage: k.percentage ?? 100, targeting: k.targeting ? JSON.parse(k.targeting) : null }));

  const urls = (db.prepare('SELECT key, value, targeting FROM dynamic_urls ORDER BY key ASC').all() as UrlRow[])
    .map(u => ({ key: u.key, value: u.value, targeting: u.targeting ? JSON.parse(u.targeting) : null }));

  res.setHeader('Content-Disposition', `attachment; filename="config-snapshot-${Date.now()}.json"`);
  return res.json({ exported_at: new Date().toISOString(), flags, experiments, kill_switches, urls });
});

export default router;
