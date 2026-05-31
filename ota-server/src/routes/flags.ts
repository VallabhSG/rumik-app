import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { logChange, diffObjects } from '../services/audit.js';
import { notifyAdminChange } from '../services/notifier.js';

const router = Router();

const TargetingSchema = z.object({
  platforms: z.array(z.enum(['ios', 'android', 'web'])).optional(),
  min_version: z.string().optional(),
  max_version: z.string().optional(),
  percentage: z.number().min(0).max(100).optional(),
}).optional().nullable();

const CreateFlagSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Key must be snake_case'),
  enabled: z.boolean().default(false),
  description: z.string().optional().nullable(),
  targeting: TargetingSchema,
});

const UpdateFlagSchema = CreateFlagSchema.partial().omit({ key: true });

interface FlagRow {
  id: string;
  key: string;
  enabled: number;
  description: string | null;
  targeting: string | null;
  created_at: string;
  updated_at: string;
}

function parseFlag(row: FlagRow) {
  return {
    ...row,
    enabled: row.enabled === 1,
    targeting: row.targeting ? JSON.parse(row.targeting) : null,
  };
}

// GET /api/flags
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM feature_flags ORDER BY created_at DESC').all() as FlagRow[];
  res.json({ success: true, data: rows.map(parseFlag) });
});

// GET /api/flags/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(req.params.id) as FlagRow | undefined;
  if (!row) return res.status(404).json({ success: false, error: 'Flag not found' });
  return res.json({ success: true, data: parseFlag(row) });
});

// POST /api/flags
router.post('/', (req, res) => {
  const result = CreateFlagSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.flatten() });
  }
  const { key, enabled, description, targeting } = result.data;
  const id = uuid();
  const now = new Date().toISOString();
  const targetingJson = targeting ? JSON.stringify(targeting) : null;

  try {
    db.prepare(
      'INSERT INTO feature_flags (id, key, enabled, description, targeting, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, key, enabled ? 1 : 0, description ?? null, targetingJson, now, now);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ success: false, error: `Flag key '${key}' already exists` });
    }
    throw err;
  }

  logChange('flag', id, 'created', null, res.locals.actor as string);
  void notifyAdminChange('Feature Flag', key, 'created', enabled ? 'Initially enabled' : 'Initially disabled');
  const row = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(id) as FlagRow;
  return res.status(201).json({ success: true, data: parseFlag(row) });
});

// PATCH /api/flags/:id
router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(req.params.id) as FlagRow | undefined;
  if (!existing) return res.status(404).json({ success: false, error: 'Flag not found' });

  const result = UpdateFlagSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.flatten() });
  }

  const updates = result.data;
  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if ('targeting' in updates) { fields.push('targeting = ?'); values.push(updates.targeting ? JSON.stringify(updates.targeting) : null); }

  values.push(req.params.id);
  db.prepare(`UPDATE feature_flags SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(req.params.id) as FlagRow;
  logChange('flag', req.params.id, 'updated', diffObjects(
    { enabled: existing.enabled, description: existing.description, targeting: existing.targeting },
    { enabled: updated.enabled, description: updated.description, targeting: updated.targeting },
  ), res.locals.actor as string);
  if (updates.enabled !== undefined && existing.enabled !== updated.enabled) {
    void notifyAdminChange('Feature Flag', updated.key, updated.enabled ? 'activated' : 'deactivated');
  }
  return res.json({ success: true, data: parseFlag(updated) });
});

// DELETE /api/flags/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(req.params.id) as FlagRow | undefined;
  if (!existing) return res.status(404).json({ success: false, error: 'Flag not found' });

  db.prepare('DELETE FROM feature_flags WHERE id = ?').run(req.params.id);
  logChange('flag', req.params.id, 'deleted', null, res.locals.actor as string);
  void notifyAdminChange('Feature Flag', existing.key, 'deleted');
  return res.json({ success: true, data: null });
});

export default router;
