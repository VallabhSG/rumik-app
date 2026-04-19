import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import perfMetricsRouter from '../../routes/perfMetrics.js';

const app = express();
app.use(express.json());
app.use('/api/perf-metrics', perfMetricsRouter);

beforeEach(() => { testDb.exec('DELETE FROM perf_metrics'); });

describe('Perf Metrics API', () => {
  const validPayload = {
    device_id: 'dev-1',
    version: '1.0.0',
    channel: 'production',
    platform: 'ios',
    metrics: [
      { metric_type: 'startup_ms', value: 850 },
      { metric_type: 'update_download_ms', value: 1200 },
    ],
  };

  describe('POST /api/perf-metrics', () => {
    it('inserts batch and returns inserted count', async () => {
      const res = await request(app).post('/api/perf-metrics').send(validPayload);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inserted).toBe(2);
    });

    it('returns 400 for missing device_id', async () => {
      const { device_id: _d, ...body } = validPayload;
      const res = await request(app).post('/api/perf-metrics').send(body);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for unknown metric_type', async () => {
      const res = await request(app).post('/api/perf-metrics').send({
        ...validPayload,
        metrics: [{ metric_type: 'unknown_metric', value: 100 }],
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for empty metrics array', async () => {
      const res = await request(app).post('/api/perf-metrics').send({ ...validPayload, metrics: [] });
      expect(res.status).toBe(400);
    });

    it('uses custom recorded_at when provided', async () => {
      const ts = '2024-01-15T10:00:00.000Z';
      const res = await request(app).post('/api/perf-metrics').send({
        ...validPayload,
        metrics: [{ metric_type: 'startup_ms', value: 500, recorded_at: ts }],
      });
      expect(res.status).toBe(201);
      const row = testDb.prepare('SELECT * FROM perf_metrics WHERE metric_type = ?').get('startup_ms') as { recorded_at: string };
      expect(row.recorded_at).toBe(ts);
    });
  });

  describe('GET /api/perf-metrics/timeseries', () => {
    it('returns 400 when metric_type is missing', async () => {
      const res = await request(app).get('/api/perf-metrics/timeseries');
      expect(res.status).toBe(400);
    });

    it('returns timeseries buckets', async () => {
      await request(app).post('/api/perf-metrics').send(validPayload);
      const res = await request(app).get('/api/perf-metrics/timeseries?metric_type=startup_ms&hours=24');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/perf-metrics/summary', () => {
    it('returns empty array when no data', async () => {
      const res = await request(app).get('/api/perf-metrics/summary');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('returns P50/P95/P99 per version+metric_type', async () => {
      await request(app).post('/api/perf-metrics').send({
        ...validPayload,
        metrics: Array.from({ length: 10 }, (_, i) => ({ metric_type: 'startup_ms', value: (i + 1) * 100 })),
      });
      const res = await request(app).get('/api/perf-metrics/summary?version=1.0.0&metric_type=startup_ms');
      expect(res.status).toBe(200);
      expect(res.body.data[0].sample_count).toBe(10);
      expect(res.body.data[0].p50).toBeGreaterThan(0);
      expect(res.body.data[0].p95).toBeGreaterThan(res.body.data[0].p50);
    });
  });
});
