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

  logChange('experiment', id, 'created', null);
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
  ));
  return res.json({ success: true, data: parseExperiment(updated) });
});

// DELETE /api/experiments/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id) as ExperimentRow | undefined;
  if (!existing) return res.status(404).json({ success: false, error: 'Experiment not found' });

  db.prepare('DELETE FROM experiments WHERE id = ?').run(req.params.id);
  logChange('experiment', req.params.id, 'deleted', null);
  return res.json({ success: true, data: null });
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

// GET /api/experiments/:key/results
router.get('/:key/results', (req, res) => {
  const exp = db.prepare('SELECT id, variants FROM experiments WHERE key = ?').get(req.params.key) as { id: string; variants: string } | undefined;
  if (!exp) return void res.status(404).json({ error: 'Experiment not found' });
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
  return void res.json({ variants: variantStats, winner });
});

export default router;
