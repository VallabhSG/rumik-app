import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { logChange, diffObjects } from '../services/audit.js';
import { notifyAdminChange } from '../services/notifier.js';

const router = Router();

// broadcast is set by index.ts after the WS server is created
let _broadcast: ((msg: object) => void) | null = null;
export function setBroadcast(fn: (msg: object) => void): void {
  _broadcast = fn;
}

const CreateKillSwitchSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Key must be snake_case'),
  active: z.boolean().default(false),
  reason: z.string().optional().nullable(),
  percentage: z.number().int().min(1).max(100).default(100),
});

const UpdateKillSwitchSchema = z.object({
  reason: z.string().optional().nullable(),
  percentage: z.number().int().min(1).max(100).optional(),
});

interface KillSwitchRow {
  id: string;
  key: string;
  active: number;
  reason: string | null;
  percentage: number;
  created_at: string;
  updated_at: string;
}

function parseKillSwitch(row: KillSwitchRow) {
  return { ...row, active: row.active === 1, percentage: row.percentage ?? 100 };
}

// GET /api/kill-switches
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM kill_switches ORDER BY created_at DESC').all() as KillSwitchRow[];
  res.json({ success: true, data: rows.map(parseKillSwitch) });
});

// GET /api/kill-switches/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM kill_switches WHERE id = ?').get(req.params.id) as KillSwitchRow | undefined;
  if (!row) return res.status(404).json({ success: false, error: 'Kill switch not found' });
  return res.json({ success: true, data: parseKillSwitch(row) });
});

// POST /api/kill-switches
router.post('/', (req, res) => {
  const result = CreateKillSwitchSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.flatten() });
  }
  const { key, active, reason, percentage } = result.data;
  const id = uuid();
  const now = new Date().toISOString();

  try {
    db.prepare(
      'INSERT INTO kill_switches (id, key, active, reason, percentage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, key, active ? 1 : 0, reason ?? null, percentage, now, now);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ success: false, error: `Kill switch key '${key}' already exists` });
    }
    throw err;
  }

  logChange('kill_switch', id, 'created', null, res.locals.actor as string);
  void notifyAdminChange('Kill Switch', key, 'created', `Rollout: ${percentage}%`);
  const row = db.prepare('SELECT * FROM kill_switches WHERE id = ?').get(id) as KillSwitchRow;
  return res.status(201).json({ success: true, data: parseKillSwitch(row) });
});

// PATCH /api/kill-switches/:id
router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM kill_switches WHERE id = ?').get(req.params.id) as KillSwitchRow | undefined;
  if (!existing) return res.status(404).json({ success: false, error: 'Kill switch not found' });

  const result = UpdateKillSwitchSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.flatten() });
  }

  const updates = result.data;
  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];
  if ('reason' in updates) { fields.push('reason = ?'); values.push(updates.reason ?? null); }
  if (updates.percentage !== undefined) { fields.push('percentage = ?'); values.push(updates.percentage); }
  values.push(req.params.id);
  db.prepare(`UPDATE kill_switches SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM kill_switches WHERE id = ?').get(req.params.id) as KillSwitchRow;
  logChange('kill_switch', req.params.id, 'updated', diffObjects(
    { reason: existing.reason, percentage: existing.percentage },
    { reason: updated.reason, percentage: updated.percentage },
  ), res.locals.actor as string);
  return res.json({ success: true, data: parseKillSwitch(updated) });
});

// POST /api/kill-switches/:id/activate
router.post('/:id/activate', (req, res) => {
  const row = db.prepare('SELECT * FROM kill_switches WHERE id = ?').get(req.params.id) as KillSwitchRow | undefined;
  if (!row) return res.status(404).json({ success: false, error: 'Kill switch not found' });

  const now = new Date().toISOString();
  db.prepare('UPDATE kill_switches SET active = 1, updated_at = ? WHERE id = ?').run(now, req.params.id);

  const updated = db.prepare('SELECT * FROM kill_switches WHERE id = ?').get(req.params.id) as KillSwitchRow;
  logChange('kill_switch', req.params.id, 'activated', null, res.locals.actor as string);
  void notifyAdminChange('Kill Switch', updated.key, 'activated', updated.reason ?? undefined);

  _broadcast?.({ type: 'kill_switch', key: updated.key, active: true, reason: updated.reason });
  return res.json({ success: true, data: parseKillSwitch(updated) });
});

// POST /api/kill-switches/:id/deactivate
router.post('/:id/deactivate', (req, res) => {
  const row = db.prepare('SELECT * FROM kill_switches WHERE id = ?').get(req.params.id) as KillSwitchRow | undefined;
  if (!row) return res.status(404).json({ success: false, error: 'Kill switch not found' });

  const now = new Date().toISOString();
  db.prepare('UPDATE kill_switches SET active = 0, updated_at = ? WHERE id = ?').run(now, req.params.id);

  const updated = db.prepare('SELECT * FROM kill_switches WHERE id = ?').get(req.params.id) as KillSwitchRow;
  logChange('kill_switch', req.params.id, 'deactivated', null, res.locals.actor as string);
  void notifyAdminChange('Kill Switch', updated.key, 'deactivated');

  _broadcast?.({ type: 'kill_switch', key: updated.key, active: false, reason: updated.reason });
  return res.json({ success: true, data: parseKillSwitch(updated) });
});

// DELETE /api/kill-switches/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM kill_switches WHERE id = ?').get(req.params.id) as KillSwitchRow | undefined;
  if (!existing) return res.status(404).json({ success: false, error: 'Kill switch not found' });

  db.prepare('DELETE FROM kill_switches WHERE id = ?').run(req.params.id);
  logChange('kill_switch', req.params.id, 'deleted', null, res.locals.actor as string);
  void notifyAdminChange('Kill Switch', existing.key, 'deleted');
  return res.json({ success: true, data: null });
});

export default router;
