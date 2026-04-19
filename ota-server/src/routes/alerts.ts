import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import db from '../db.js';

const router = Router();

const METRICS = ['crash_rate', 'adoption_rate', 'failure_rate', 'p95_startup_ms', 'p95_download_ms'] as const;
const OPERATORS = ['gt', 'lt', 'gte', 'lte'] as const;

const CreateRuleSchema = z.object({
  name: z.string().min(1),
  metric: z.enum(METRICS),
  operator: z.enum(OPERATORS),
  threshold: z.number().finite(),
  channel: z.string().default('production'),
  version: z.string().optional(),
  window_mins: z.number().int().min(1).default(60),
  cooldown_mins: z.number().int().min(1).default(30),
  webhook_url: z.string().url(),
});

const UpdateRuleSchema = CreateRuleSchema.partial().omit({ webhook_url: true }).extend({
  enabled: z.boolean().optional(),
  webhook_url: z.string().url().optional(),
});

interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  channel: string;
  version: string | null;
  window_mins: number;
  cooldown_mins: number;
  enabled: number;
  webhook_url: string;
  created_at: string;
  updated_at: string;
}

// GET /api/alerts/rules
router.get('/rules', (_req: Request, res: Response) => {
  const rules = db.prepare('SELECT * FROM alert_rules ORDER BY created_at DESC').all();
  res.json({ success: true, data: rules });
});

// POST /api/alerts/rules
router.post('/rules', (req: Request, res: Response) => {
  const parsed = CreateRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { name, metric, operator, threshold, channel, version, window_mins, cooldown_mins, webhook_url } = parsed.data;
  const now = new Date().toISOString();
  const id = uuid();

  db.prepare(`
    INSERT INTO alert_rules
      (id, name, metric, operator, threshold, channel, version, window_mins, cooldown_mins, enabled, webhook_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, name, metric, operator, threshold, channel, version ?? null, window_mins, cooldown_mins, webhook_url, now, now);

  const rule = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id);
  res.status(201).json({ success: true, data: rule });
});

// PATCH /api/alerts/rules/:id
router.patch('/rules/:id', (req: Request, res: Response) => {
  const rule = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(req.params.id) as AlertRule | undefined;
  if (!rule) {
    res.status(404).json({ success: false, error: 'Alert rule not found' });
    return;
  }

  const parsed = UpdateRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const updates = parsed.data;
  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      fields.push(`${key} = ?`);
      params.push(key === 'enabled' ? (val ? 1 : 0) : val);
    }
  }

  params.push(req.params.id);
  db.prepare(`UPDATE alert_rules SET ${fields.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: updated });
});

// DELETE /api/alerts/rules/:id
router.delete('/rules/:id', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM alert_rules WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ success: false, error: 'Alert rule not found' });
    return;
  }
  res.json({ success: true });
});

// GET /api/alerts/history
router.get('/history', (req: Request, res: Response) => {
  const { rule_id, limit = '50', offset = '0' } = req.query as Record<string, string | undefined>;

  const conds: string[] = [];
  const params: unknown[] = [];

  if (rule_id) { conds.push('rule_id = ?'); params.push(rule_id); }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as c FROM alert_history ${where}`).get(...params) as { c: number }).c;
  const rows = db.prepare(`
    SELECT h.*, r.name as rule_name
    FROM alert_history h
    LEFT JOIN alert_rules r ON r.id = h.rule_id
    ${where}
    ORDER BY h.fired_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  res.json({ success: true, data: rows, meta: { total, limit: Number(limit), offset: Number(offset) } });
});

export default router;
