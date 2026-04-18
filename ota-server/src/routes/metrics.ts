import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import db from '../db.js';

const router = Router();

const RecordCrashRateSchema = z.object({
  crash_rate: z.number().min(0).max(1),
  version: z.string().optional(),
  channel: z.string().optional(),
});

// GET /api/crash-rate/current
router.get('/current', (req: Request, res: Response) => {
  const { channel = 'production' } = req.query;

  const row = db.prepare(`
    SELECT * FROM crash_rates
    WHERE channel = ? OR channel IS NULL
    ORDER BY recorded_at DESC LIMIT 1
  `).get(channel) as { crash_rate: number; version?: string; channel?: string; recorded_at: string } | undefined;

  res.json({
    success: true,
    data: {
      crash_rate: row?.crash_rate ?? 0,
      version: row?.version ?? null,
      channel: row?.channel ?? channel,
      recorded_at: row?.recorded_at ?? new Date().toISOString(),
    },
  });
});

// GET /api/crash-rate/history
router.get('/history', (req: Request, res: Response) => {
  const { channel, limit = '50' } = req.query;
  let query = 'SELECT * FROM crash_rates';
  const params: unknown[] = [];

  if (channel) { query += ' WHERE channel = ?'; params.push(channel); }
  query += ` ORDER BY recorded_at DESC LIMIT ${Number(limit)}`;

  const rows = db.prepare(query).all(...params);
  res.json({ success: true, data: rows });
});

// POST /api/crash-rate  — ingest crash rate from monitoring
router.post('/', (req: Request, res: Response) => {
  const parsed = RecordCrashRateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { crash_rate, version, channel } = parsed.data;
  const now = new Date().toISOString();
  const id = uuid();

  db.prepare(`
    INSERT INTO crash_rates (id, crash_rate, version, channel, recorded_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, crash_rate, version ?? null, channel ?? null, now);

  res.status(201).json({ success: true, data: { id, crash_rate, version, channel, recorded_at: now } });
});

export default router;
