import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import db from '../db.js';

const router = Router();

const CreateScheduleSchema = z.object({
  entity_type: z.enum(['flag', 'experiment', 'kill_switch']),
  entity_id: z.string().min(1),
  action: z.enum(['activate', 'deactivate', 'update_targeting', 'complete']),
  payload: z.record(z.unknown()).optional(),
  scheduled_at: z.string().datetime(),
  created_by: z.string().min(1).default('api'),
});

interface ScheduleRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: string | null;
  scheduled_at: string;
  executed_at: string | null;
  created_by: string;
  created_at: string;
}

function parseSchedule(row: ScheduleRow) {
  return {
    ...row,
    payload: row.payload ? JSON.parse(row.payload) : null,
  };
}

// GET /api/schedules — list all, filter ?entity_type=flag or ?pending=true
router.get('/', (req: Request, res: Response) => {
  const { entity_type, pending } = req.query;

  let query = 'SELECT * FROM flag_schedules WHERE 1=1';
  const params: unknown[] = [];

  if (entity_type) {
    query += ' AND entity_type = ?';
    params.push(entity_type);
  }

  if (pending === 'true') {
    query += ' AND executed_at IS NULL';
  }

  query += ' ORDER BY scheduled_at ASC';

  const rows = db.prepare(query).all(...params) as ScheduleRow[];
  return res.json({ success: true, data: rows.map(parseSchedule) });
});

// GET /api/schedules/:id
router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM flag_schedules WHERE id = ?').get(req.params.id) as ScheduleRow | undefined;

  if (!row) {
    return res.status(404).json({ success: false, error: 'Schedule not found' });
  }

  return res.json({ success: true, data: parseSchedule(row) });
});

// POST /api/schedules
router.post('/', (req: Request, res: Response) => {
  const result = CreateScheduleSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error.errors[0].message });
  }

  const { entity_type, entity_id, action, payload, scheduled_at, created_by } = result.data;
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO flag_schedules (id, entity_type, entity_id, action, payload, scheduled_at, executed_at, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(id, entity_type, entity_id, action, payload ? JSON.stringify(payload) : null, scheduled_at, created_by, now);

  const row = db.prepare('SELECT * FROM flag_schedules WHERE id = ?').get(id) as ScheduleRow;
  return res.status(201).json({ success: true, data: parseSchedule(row) });
});

// DELETE /api/schedules/:id — only if not yet executed
router.delete('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM flag_schedules WHERE id = ?').get(req.params.id) as ScheduleRow | undefined;

  if (!row) {
    return res.status(404).json({ success: false, error: 'Schedule not found' });
  }

  if (row.executed_at !== null) {
    return res.status(409).json({ success: false, error: 'Cannot delete an already-executed schedule' });
  }

  db.prepare('DELETE FROM flag_schedules WHERE id = ?').run(req.params.id);
  return res.json({ success: true, data: { id: req.params.id } });
});

export default router;
