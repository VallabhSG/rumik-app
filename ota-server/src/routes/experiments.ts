import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { logChange, diffObjects } from '../services/audit.js';

const router = Router();

const VariantSchema = z.object({
  id: z.string().min(1),
  weight: z.number().min(0),
});

const TargetingSchema = z.object({
  platforms: z.array(z.enum(['ios', 'android', 'web'])).optional(),
  min_version: z.string().optional(),
  max_version: z.string().optional(),
  percentage: z.number().min(0).max(100).optional(),
}).optional().nullable();

const CreateExperimentSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Key must be snake_case'),
  variants: z.array(VariantSchema).min(2, 'At least 2 variants required'),
  targeting: TargetingSchema,
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
});

const UpdateExperimentSchema = z.object({
  status: z.enum(['draft', 'active', 'paused', 'completed']).optional(),
  variants: z.array(VariantSchema).min(2).optional(),
  targeting: TargetingSchema,
});

interface ExperimentRow {
  id: string;
  key: string;
  status: string;
  variants: string;
  targeting: string | null;
  created_at: string;
  updated_at: string;
}

function parseExperiment(row: ExperimentRow) {
  return {
    ...row,
    variants: JSON.parse(row.variants) as Array<{ id: string; weight: number }>,
    targeting: row.targeting ? JSON.parse(row.targeting) : null,
  };
}

// GET /api/experiments
router.get('/', (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare('SELECT * FROM experiments WHERE status = ? ORDER BY created_at DESC').all(status) as ExperimentRow[]
    : db.prepare('SELECT * FROM experiments ORDER BY created_at DESC').all() as ExperimentRow[];
  res.json({ success: true, data: rows.map(parseExperiment) });
});

// GET /api/experiments/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id) as ExperimentRow | undefined;
  if (!row) return res.status(404).json({ success: false, error: 'Experiment not found' });
  return res.json({ success: true, data: parseExperiment(row) });
});

// POST /api/experiments
router.post('/', (req, res) => {
  const result = CreateExperimentSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.flatten() });
  }
  const { key, variants, targeting, status: initialStatus } = result.data;
  const id = uuid();
  const now = new Date().toISOString();

  try {
    db.prepare(
      'INSERT INTO experiments (id, key, status, variants, targeting, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, key, initialStatus ?? 'draft', JSON.stringify(variants), targeting ? JSON.stringify(targeting) : null, now, now);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ success: false, error: `Experiment key '${key}' already exists` });
    }
    throw err;
  }

  logChange('experiment', id, 'created', null, res.locals.actor as string);
  const row = db.prepare('SELECT * FROM experiments WHERE id = ?').get(id) as ExperimentRow;
  return res.status(201).json({ success: true, data: parseExperiment(row) });
});

// PATCH /api/experiments/:id
router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id) as ExperimentRow | undefined;
  if (!existing) return res.status(404).json({ success: false, error: 'Experiment not found' });

  const result = UpdateExperimentSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.flatten() });
  }

  const updates = result.data;
  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.variants !== undefined) { fields.push('variants = ?'); values.push(JSON.stringify(updates.variants)); }
  if ('targeting' in updates) { fields.push('targeting = ?'); values.push(updates.targeting ? JSON.stringify(updates.targeting) : null); }

  values.push(req.params.id);
  db.prepare(`UPDATE experiments SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id) as ExperimentRow;
  logChange('experiment', req.params.id, 'updated', diffObjects(
    { status: existing.status, variants: existing.variants, targeting: existing.targeting },
    { status: updated.status, variants: updated.variants, targeting: updated.targeting },
  ), res.locals.actor as string);
  return res.json({ success: true, data: parseExperiment(updated) });
});

// DELETE /api/experiments/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id) as ExperimentRow | undefined;
  if (!existing) return res.status(404).json({ success: false, error: 'Experiment not found' });

  db.prepare('DELETE FROM experiments WHERE id = ?').run(req.params.id);
  logChange('experiment', req.params.id, 'deleted', null, res.locals.actor as string);
  return res.json({ success: true, data: null });
});

// DELETE /api/experiments/:key/assignments — clears all stored variant assignments so
// the next config fetch re-bucketes everyone against the current weights. Dev/testing only.
router.delete('/:key/assignments', (req, res) => {
  const exp = db.prepare('SELECT id FROM experiments WHERE key = ?').get(req.params.key) as { id: string } | undefined;
  if (!exp) return void res.status(404).json({ success: false, error: 'Experiment not found' });

  const result = db.prepare('DELETE FROM experiment_assignments WHERE experiment_id = ?').run(exp.id);
  logChange('experiment', exp.id, 'assignments_cleared', null, res.locals.actor as string);
  return void res.json({ success: true, data: { deleted: result.changes } });
});

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

// POST /api/experiments/:key/expose
router.post('/:key/expose', (req, res) => {
  const parse = ExposeSchema.safeParse(req.body);
  if (!parse.success) return void res.status(400).json({ error: parse.error.flatten() });
  const exp = db.prepare('SELECT id FROM experiments WHERE key = ?').get(req.params.key) as { id: string } | undefined;
  if (!exp) return void res.status(404).json({ error: 'Experiment not found' });
  const { install_id, user_id, variant_id } = parse.data;
  db.prepare(
    `INSERT OR IGNORE INTO experiment_exposures (id, experiment_id, install_id, user_id, variant_id, exposed_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(randomUUID(), exp.id, install_id, user_id ?? null, variant_id);
  return void res.json({ ok: true });
});

// POST /api/experiments/:key/convert
router.post('/:key/convert', (req, res) => {
  const parse = ConvertSchema.safeParse(req.body);
  if (!parse.success) return void res.status(400).json({ error: parse.error.flatten() });
  const exp = db.prepare('SELECT id FROM experiments WHERE key = ?').get(req.params.key) as { id: string } | undefined;
  if (!exp) return void res.status(404).json({ error: 'Experiment not found' });
  const { install_id, user_id, variant_id, event_name, value } = parse.data;
  db.prepare(
    `INSERT INTO experiment_conversions (id, experiment_id, install_id, user_id, variant_id, event_name, value, converted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(randomUUID(), exp.id, install_id, user_id ?? null, variant_id, event_name, value);
  return void res.json({ ok: true });
});

function normalCDF(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function twoProportionZTest(n1: number, x1: number, n2: number, x2: number): { p_value: number; significant: boolean } {
  if (n1 === 0 || n2 === 0) return { p_value: 1, significant: false };
  const p1 = x1 / n1, p2 = x2 / n2;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return { p_value: 1, significant: false };
  const z = Math.abs(p1 - p2) / se;
  const p_value = Math.min(1, 2 * (1 - normalCDF(z)));
  return { p_value: Math.round(p_value * 10000) / 10000, significant: p_value < 0.05 };
}

// GET /api/experiments/:key/results
router.get('/:key/results', (req, res) => {
  const exp = db.prepare('SELECT id, variants FROM experiments WHERE key = ?').get(req.params.key) as { id: string; variants: string } | undefined;
  if (!exp) return void res.status(404).json({ error: 'Experiment not found' });
  const variants: { id: string; weight: number }[] = JSON.parse(exp.variants);

  const variantStats = variants.map(v => {
    const exposures = (db.prepare(
      'SELECT COUNT(DISTINCT install_id) as cnt FROM experiment_exposures WHERE experiment_id = ? AND variant_id = ?'
    ).get(exp.id, v.id) as { cnt: number }).cnt;
    const conversions = (db.prepare(
      'SELECT COUNT(DISTINCT install_id) as cnt FROM experiment_conversions WHERE experiment_id = ? AND variant_id = ?'
    ).get(exp.id, v.id) as { cnt: number }).cnt;
    const rate = exposures > 0 ? conversions / exposures : 0;
    return { id: v.id, exposures, conversions, rate, lift_vs_control: null as number | null, p_value: null as number | null, significant: false };
  });

  const control = variantStats.find(v => v.id === 'control');
  if (control && control.rate > 0) {
    for (const v of variantStats) {
      v.lift_vs_control = (v.rate - control.rate) / control.rate;
      if (v.id !== 'control') {
        const { p_value, significant } = twoProportionZTest(control.exposures, control.conversions, v.exposures, v.conversions);
        v.p_value = p_value;
        v.significant = significant;
      }
    }
  }

  let winner: string | null = null;
  if (control) {
    winner = variantStats.find(v => v.id !== 'control' && v.significant && (v.lift_vs_control ?? 0) >= 0.1)?.id ?? null;
  } else {
    const sampled = variantStats.filter(v => v.exposures >= 100);
    if (sampled.length > 0) {
      const best = sampled.reduce((a, b) => (a.rate >= b.rate ? a : b));
      winner = best.rate > 0 ? best.id : null;
    }
  }
  return void res.json({ variants: variantStats, winner });
});

// POST /api/experiments/:key/promote — promote a variant to 100% weight and complete the experiment
router.post('/:key/promote', (req, res) => {
  const { variant_id } = req.body as { variant_id?: string };
  if (!variant_id) return void res.status(400).json({ success: false, error: 'variant_id is required' });

  const exp = db.prepare('SELECT * FROM experiments WHERE key = ?').get(req.params.key) as ExperimentRow | undefined;
  if (!exp) return void res.status(404).json({ success: false, error: 'Experiment not found' });

  const variants = JSON.parse(exp.variants) as Array<{ id: string; weight: number }>;
  if (!variants.find(v => v.id === variant_id)) {
    return void res.status(400).json({ success: false, error: `Variant '${variant_id}' not found` });
  }

  const promoted = variants.map(v => ({ ...v, weight: v.id === variant_id ? 100 : 0 }));
  const now = new Date().toISOString();
  db.prepare('UPDATE experiments SET variants = ?, status = ?, updated_at = ? WHERE key = ?')
    .run(JSON.stringify(promoted), 'completed', now, req.params.key);

  logChange('experiment', exp.id, 'promoted', { variant_id: { old: null, new: variant_id } }, res.locals.actor as string);
  const updated = db.prepare('SELECT * FROM experiments WHERE key = ?').get(req.params.key) as ExperimentRow;
  return void res.json({ success: true, data: parseExperiment(updated) });
});

export default router;
