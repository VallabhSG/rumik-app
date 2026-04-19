import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import db from '../db.js';

const router = Router();

const EVENT_TYPES = [
  'eligible', 'notified', 'download_start', 'download_complete',
  'staged', 'applied', 'skipped', 'failed',
] as const;

const SingleEventSchema = z.object({
  event_type: z.enum(EVENT_TYPES),
  error_msg: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  recorded_at: z.string().optional(),
});

const IngestSchema = z.object({
  device_id: z.string().min(1),
  release_id: z.string().min(1),
  version: z.string().min(1),
  channel: z.string().default('production'),
  platform: z.string().min(1),
  events: z.array(SingleEventSchema).min(1).max(20),
});

// POST /api/update-events — ingest lifecycle events
router.post('/', (req: Request, res: Response) => {
  const parsed = IngestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { device_id, release_id, version, channel, platform, events } = parsed.data;
  const insert = db.prepare(`
    INSERT INTO update_events
      (id, device_id, release_id, version, channel, platform, event_type, error_msg, metadata, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const ev of events) {
      insert.run(
        uuid(), device_id, release_id, version, channel, platform,
        ev.event_type,
        ev.error_msg ?? null,
        ev.metadata ? JSON.stringify(ev.metadata) : null,
        ev.recorded_at ?? new Date().toISOString(),
      );
    }
  })();

  res.status(201).json({ success: true, data: { inserted: events.length } });
});

// GET /api/update-events/funnel — adoption funnel for a release
router.get('/funnel', (req: Request, res: Response) => {
  const { release_id, version, channel } = req.query as Record<string, string | undefined>;

  if (!release_id && !version) {
    res.status(400).json({ success: false, error: 'release_id or version is required' });
    return;
  }

  const conds: string[] = [];
  const params: unknown[] = [];

  if (release_id) { conds.push('release_id = ?'); params.push(release_id); }
  if (version)    { conds.push('version = ?');    params.push(version); }
  if (channel)    { conds.push('channel = ?');    params.push(channel); }

  const where = `WHERE ${conds.join(' AND ')}`;

  // Count distinct devices per event_type (funnel stages)
  const rows = db.prepare(`
    SELECT event_type, COUNT(DISTINCT device_id) AS device_count
    FROM update_events ${where}
    GROUP BY event_type
  `).all(...params) as Array<{ event_type: string; device_count: number }>;

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.event_type] = r.device_count;

  const eligible   = counts['eligible']          ?? 0;
  const notified   = counts['notified']          ?? 0;
  const downloading = counts['download_start']   ?? 0;
  const staged     = counts['staged']            ?? 0;
  const applied    = counts['applied']           ?? 0;
  const skipped    = counts['skipped']           ?? 0;
  const failed     = counts['failed']            ?? 0;

  const adoptionRate = eligible > 0 ? applied / eligible : 0;
  const failureRate  = downloading > 0 ? failed / downloading : 0;

  // Resolve release_id + version for the response
  const meta = release_id
    ? { release_id }
    : { release_id: version ?? 'unknown' };

  res.json({
    success: true,
    data: {
      ...meta,
      version: version ?? release_id ?? 'unknown',
      funnel: { eligible, notified, downloading, staged, applied, skipped, failed },
      adoption_rate: Math.round(adoptionRate * 10000) / 10000,
      failure_rate: Math.round(failureRate * 10000) / 10000,
    },
  });
});

// GET /api/update-events/timeseries — applied/failed count per hour
router.get('/timeseries', (req: Request, res: Response) => {
  const { release_id, version, channel, hours = '48' } = req.query as Record<string, string | undefined>;

  if (!release_id && !version) {
    res.status(400).json({ success: false, error: 'release_id or version is required' });
    return;
  }

  const since = new Date(Date.now() - Number(hours) * 3_600_000).toISOString();
  const conds: string[] = ['recorded_at >= ?'];
  const params: unknown[] = [since];

  if (release_id) { conds.push('release_id = ?'); params.push(release_id); }
  if (version)    { conds.push('version = ?');    params.push(version); }
  if (channel)    { conds.push('channel = ?');    params.push(channel); }

  const where = `WHERE ${conds.join(' AND ')}`;

  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m-%dT%H:00:00', recorded_at) AS bucket,
      SUM(CASE WHEN event_type = 'applied'  THEN 1 ELSE 0 END) AS applied,
      SUM(CASE WHEN event_type = 'failed'   THEN 1 ELSE 0 END) AS failed
    FROM update_events ${where}
    GROUP BY bucket
    ORDER BY bucket ASC
  `).all(...params);

  res.json({ success: true, data: rows });
});

export default router;
