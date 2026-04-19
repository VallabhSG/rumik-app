import { Router, Request, Response } from 'express';
import { z } from 'zod';
import db from '../db.js';
import { groupError } from '../services/errorGrouper.js';

const router = Router();

const StackFrameSchema = z.object({
  file: z.string(),
  line: z.number().int().optional(),
  column: z.number().int().optional(),
  func: z.string().optional(),
});

const IngestSchema = z.object({
  device_id: z.string().min(1),
  version: z.string().min(1),
  channel: z.string().default('production'),
  platform: z.string().min(1),
  error_type: z.string().min(1),
  message: z.string().min(1),
  stack_trace: z.array(StackFrameSchema).min(1),
  context: z.record(z.unknown()).optional(),
});

// POST /api/errors — ingest error event
router.post('/', (req: Request, res: Response) => {
  const parsed = IngestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const result = groupError(parsed.data);
  res.status(201).json({ success: true, data: result });
});

// GET /api/errors/groups — list error groups
router.get('/groups', (req: Request, res: Response) => {
  const { status, version, channel, limit = '50', offset = '0' } = req.query as Record<string, string | undefined>;

  const conds: string[] = [];
  const params: unknown[] = [];

  if (status)  { conds.push('status = ?');  params.push(status); }
  if (version) { conds.push('version = ?'); params.push(version); }
  if (channel) { conds.push('channel = ?'); params.push(channel); }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as c FROM error_groups ${where}`).get(...params) as { c: number }).c;
  const groups = db.prepare(`
    SELECT * FROM error_groups ${where}
    ORDER BY last_seen DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  res.json({
    success: true,
    data: groups,
    meta: { total, limit: Number(limit), offset: Number(offset) },
  });
});

// GET /api/errors/groups/:id — group detail + recent events
router.get('/groups/:id', (req: Request, res: Response) => {
  const group = db.prepare('SELECT * FROM error_groups WHERE id = ?').get(req.params.id);
  if (!group) {
    res.status(404).json({ success: false, error: 'Error group not found' });
    return;
  }

  const events = db.prepare(`
    SELECT * FROM error_events WHERE group_id = ?
    ORDER BY recorded_at DESC LIMIT 10
  `).all(req.params.id);

  res.json({ success: true, data: { group, recent_events: events } });
});

// PATCH /api/errors/groups/:id — update status
router.patch('/groups/:id', (req: Request, res: Response) => {
  const { status } = req.body as { status?: string };
  if (!status || !['open', 'resolved', 'ignored'].includes(status)) {
    res.status(400).json({ success: false, error: 'status must be open | resolved | ignored' });
    return;
  }

  const now = new Date().toISOString();
  const result = db.prepare(
    'UPDATE error_groups SET status = ?, updated_at = ? WHERE id = ?',
  ).run(status, now, req.params.id);

  if (result.changes === 0) {
    res.status(404).json({ success: false, error: 'Error group not found' });
    return;
  }

  res.json({ success: true, data: db.prepare('SELECT * FROM error_groups WHERE id = ?').get(req.params.id) });
});

// GET /api/errors/timeseries — error events per hour
router.get('/timeseries', (req: Request, res: Response) => {
  const { hours = '24', version, channel } = req.query as Record<string, string | undefined>;
  const since = new Date(Date.now() - Number(hours) * 3_600_000).toISOString();
  const params: unknown[] = [since];
  const extra: string[] = [];

  if (version) { extra.push('version = ?'); params.push(version); }
  if (channel) { extra.push('channel = ?'); params.push(channel); }

  const where = `WHERE recorded_at >= ? ${extra.length ? `AND ${extra.join(' AND ')}` : ''}`;

  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m-%dT%H:00:00', recorded_at) AS bucket,
      COUNT(*) AS count
    FROM error_events ${where}
    GROUP BY bucket
    ORDER BY bucket ASC
  `).all(...params);

  res.json({ success: true, data: rows });
});

export default router;
