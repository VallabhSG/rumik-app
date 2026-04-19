import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import db from '../db.js';

const router = Router();

const MetricEventSchema = z.object({
  metric_type: z.enum(['startup_ms', 'update_download_ms', 'js_fps', 'memory_mb', 'ttfb_ms']),
  value: z.number().finite(),
  recorded_at: z.string().optional(),
});

const IngestSchema = z.object({
  device_id: z.string().min(1),
  version: z.string().min(1),
  channel: z.string().default('production'),
  platform: z.enum(['ios', 'android', 'web']),
  session_id: z.string().optional(),
  metrics: z.array(MetricEventSchema).min(1).max(100),
});

// POST /api/perf-metrics — ingest a batch
router.post('/', (req: Request, res: Response) => {
  const parsed = IngestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { device_id, version, channel, platform, session_id, metrics } = parsed.data;
  const insert = db.prepare(`
    INSERT INTO perf_metrics (id, device_id, version, channel, platform, metric_type, value, session_id, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const m of metrics) {
      insert.run(
        uuid(), device_id, version, channel, platform,
        m.metric_type, m.value, session_id ?? null,
        m.recorded_at ?? new Date().toISOString(),
      );
    }
  })();

  res.status(201).json({ success: true, data: { inserted: metrics.length } });
});

// GET /api/perf-metrics/summary — P50/P95/P99 per version
router.get('/summary', (req: Request, res: Response) => {
  const { version, channel, metric_type, from, to } = req.query as Record<string, string | undefined>;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (version)     { conditions.push('version = ?');     params.push(version); }
  if (channel)     { conditions.push('channel = ?');     params.push(channel); }
  if (metric_type) { conditions.push('metric_type = ?'); params.push(metric_type); }
  if (from)        { conditions.push('recorded_at >= ?'); params.push(from); }
  if (to)          { conditions.push('recorded_at <= ?');  params.push(to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get distinct (version, metric_type) groups present in the data
  const groups = db.prepare(`
    SELECT DISTINCT version, metric_type FROM perf_metrics ${where}
  `).all(...params) as Array<{ version: string; metric_type: string }>;

  const result = groups.map(({ version: v, metric_type: mt }) => {
    const countRow = db.prepare(`
      SELECT COUNT(*) as c FROM perf_metrics
      WHERE version = ? AND metric_type = ? ${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
    `).get(v, mt, ...params) as { c: number };
    const count = countRow.c;

    const pctRow = (offset: number) =>
      (db.prepare(`
        SELECT value FROM perf_metrics
        WHERE version = ? AND metric_type = ? ${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
        ORDER BY value ASC LIMIT 1 OFFSET ?
      `).get(v, mt, ...params, offset) as { value: number } | undefined)?.value ?? 0;

    return {
      version: v,
      metric_type: mt,
      p50: pctRow(Math.max(0, Math.floor(count * 0.50) - 1)),
      p95: pctRow(Math.max(0, Math.ceil(count * 0.95) - 1)),
      p99: pctRow(Math.max(0, Math.ceil(count * 0.99) - 1)),
      sample_count: count,
    };
  });

  res.json({ success: true, data: result });
});

// GET /api/perf-metrics/timeseries — hourly averages
router.get('/timeseries', (req: Request, res: Response) => {
  const { version, metric_type, hours = '24', channel } = req.query as Record<string, string | undefined>;
  if (!metric_type) {
    res.status(400).json({ success: false, error: 'metric_type is required' });
    return;
  }

  const since = new Date(Date.now() - Number(hours) * 3_600_000).toISOString();
  const params: unknown[] = [metric_type, since];
  const extraConds: string[] = [];

  if (version) { extraConds.push('version = ?'); params.push(version); }
  if (channel) { extraConds.push('channel = ?'); params.push(channel); }

  const extra = extraConds.length ? `AND ${extraConds.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m-%dT%H:00:00', recorded_at) AS bucket,
      AVG(value) AS avg,
      COUNT(*) AS count
    FROM perf_metrics
    WHERE metric_type = ? AND recorded_at >= ? ${extra}
    GROUP BY bucket
    ORDER BY bucket ASC
  `).all(...params);

  res.json({ success: true, data: rows });
});

export default router;
