import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { evaluateAttributeRule, type AttributeRule } from '../services/targeting.js';

const router = Router();

const AttributeRuleSchema = z.object({
  attribute: z.enum(['plan', 'email_domain', 'account_age_days']),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'contains', 'in']),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

const CreateSegmentSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Key must be snake_case'),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  rules: z.array(AttributeRuleSchema),
});

const UpdateSegmentSchema = CreateSegmentSchema.partial().omit({ key: true });

interface SegmentRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  rules: string;
  created_at: string;
  updated_at: string;
}

function parseSegment(row: SegmentRow) {
  return {
    ...row,
    rules: JSON.parse(row.rules) as AttributeRule[],
  };
}

// GET /api/segments
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM segments ORDER BY created_at DESC').all() as SegmentRow[];
  res.json({ success: true, data: rows.map(parseSegment) });
});

// GET /api/segments/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM segments WHERE id = ?').get(req.params.id) as SegmentRow | undefined;
  if (!row) return res.status(404).json({ success: false, error: 'Segment not found' });
  return res.json({ success: true, data: parseSegment(row) });
});

// POST /api/segments
router.post('/', (req, res) => {
  const result = CreateSegmentSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.flatten() });
  }
  const { key, name, description, rules } = result.data;
  const id = uuid();
  const now = new Date().toISOString();

  try {
    db.prepare(
      'INSERT INTO segments (id, key, name, description, rules, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, key, name, description ?? null, JSON.stringify(rules), now, now);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ success: false, error: `Segment key '${key}' already exists` });
    }
    throw err;
  }

  const row = db.prepare('SELECT * FROM segments WHERE id = ?').get(id) as SegmentRow;
  return res.status(201).json({ success: true, data: parseSegment(row) });
});

// PATCH /api/segments/:id
router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM segments WHERE id = ?').get(req.params.id) as SegmentRow | undefined;
  if (!existing) return res.status(404).json({ success: false, error: 'Segment not found' });

  const result = UpdateSegmentSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.flatten() });
  }

  const updates = result.data;
  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.rules !== undefined) { fields.push('rules = ?'); values.push(JSON.stringify(updates.rules)); }

  values.push(req.params.id);
  db.prepare(`UPDATE segments SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM segments WHERE id = ?').get(req.params.id) as SegmentRow;
  return res.json({ success: true, data: parseSegment(updated) });
});

// DELETE /api/segments/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM segments WHERE id = ?').get(req.params.id) as SegmentRow | undefined;
  if (!existing) return res.status(404).json({ success: false, error: 'Segment not found' });

  db.prepare('DELETE FROM segments WHERE id = ?').run(req.params.id);
  return res.json({ success: true, data: null });
});

// POST /api/segments/:id/test
router.post('/:id/test', (req, res) => {
  const seg = db.prepare('SELECT * FROM segments WHERE id = ?').get(req.params.id) as SegmentRow | undefined;
  if (!seg) return res.status(404).json({ success: false, error: 'Segment not found' });

  const rules: AttributeRule[] = JSON.parse(seg.rules) as AttributeRule[];
  const userCtx = req.body as Record<string, unknown>;
  const failedRules = rules.filter(r => !evaluateAttributeRule(r, userCtx as Parameters<typeof evaluateAttributeRule>[1]));
  return res.json({ success: true, data: { matches: failedRules.length === 0, failed_rules: failedRules } });
});

export default router;
