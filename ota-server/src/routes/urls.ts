import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { logChange, diffObjects } from '../services/audit.js';

const router = Router();

const TargetingSchema = z.object({
  platforms: z.array(z.enum(['ios', 'android', 'web'])).optional(),
  min_version: z.string().optional(),
  max_version: z.string().optional(),
  percentage: z.number().min(0).max(100).optional(),
}).optional().nullable();

const CreateUrlSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Key must be snake_case'),
  value: z.string().url('Must be a valid URL'),
  targeting: TargetingSchema,
});

const UpdateUrlSchema = CreateUrlSchema.partial().omit({ key: true });

interface UrlRow {
  id: string;
  key: string;
  value: string;
  targeting: string | null;
  created_at: string;
  updated_at: string;
}

function parseUrl(row: UrlRow) {
  return {
    ...row,
    targeting: row.targeting ? JSON.parse(row.targeting) : null,
  };
}

// GET /api/urls
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM dynamic_urls ORDER BY created_at DESC').all() as UrlRow[];
  res.json({ success: true, data: rows.map(parseUrl) });
});

// GET /api/urls/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM dynamic_urls WHERE id = ?').get(req.params.id) as UrlRow | undefined;
  if (!row) return res.status(404).json({ success: false, error: 'URL not found' });
  return res.json({ success: true, data: parseUrl(row) });
});

// POST /api/urls
router.post('/', (req, res) => {
  const result = CreateUrlSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.flatten() });
  }
  const { key, value, targeting } = result.data;
  const id = uuid();
  const now = new Date().toISOString();

  try {
    db.prepare(
      'INSERT INTO dynamic_urls (id, key, value, targeting, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, key, value, targeting ? JSON.stringify(targeting) : null, now, now);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ success: false, error: `URL key '${key}' already exists` });
    }
    throw err;
  }

  logChange('url', id, 'created', null);
  const row = db.prepare('SELECT * FROM dynamic_urls WHERE id = ?').get(id) as UrlRow;
  return res.status(201).json({ success: true, data: parseUrl(row) });
});

// PATCH /api/urls/:id
router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM dynamic_urls WHERE id = ?').get(req.params.id) as UrlRow | undefined;
  if (!existing) return res.status(404).json({ success: false, error: 'URL not found' });

  const result = UpdateUrlSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.flatten() });
  }

  const updates = result.data;
  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (updates.value !== undefined) { fields.push('value = ?'); values.push(updates.value); }
  if ('targeting' in updates) { fields.push('targeting = ?'); values.push(updates.targeting ? JSON.stringify(updates.targeting) : null); }

  values.push(req.params.id);
  db.prepare(`UPDATE dynamic_urls SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM dynamic_urls WHERE id = ?').get(req.params.id) as UrlRow;
  logChange('url', req.params.id, 'updated', diffObjects(
    { value: existing.value, targeting: existing.targeting },
    { value: updated.value, targeting: updated.targeting },
  ));
  return res.json({ success: true, data: parseUrl(updated) });
});

// DELETE /api/urls/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM dynamic_urls WHERE id = ?').get(req.params.id) as UrlRow | undefined;
  if (!existing) return res.status(404).json({ success: false, error: 'URL not found' });

  db.prepare('DELETE FROM dynamic_urls WHERE id = ?').run(req.params.id);
  logChange('url', req.params.id, 'deleted', null);
  return res.json({ success: true, data: null });
});

export default router;
