import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import metricsRouter from '../../routes/metrics.js';

const app = express();
app.use(express.json());
app.use('/api/crash-rate', metricsRouter);

beforeEach(() => {
  testDb.exec('DELETE FROM crash_rates');
});

describe('Crash Rate API', () => {
  describe('POST /api/crash-rate', () => {
    it('records a crash rate', async () => {
      const res = await request(app).post('/api/crash-rate').send({ crash_rate: 0.03, version: '1.0.0', channel: 'production' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.crash_rate).toBe(0.03);
    });

    it('returns 400 for crash_rate > 1', async () => {
      const res = await request(app).post('/api/crash-rate').send({ crash_rate: 1.5 });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing crash_rate', async () => {
      const res = await request(app).post('/api/crash-rate').send({ version: '1.0.0' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/crash-rate/current', () => {
    it('returns 0 when no data', async () => {
      const res = await request(app).get('/api/crash-rate/current');
      expect(res.status).toBe(200);
      expect(res.body.data.crash_rate).toBe(0);
    });

    it('returns most recent crash rate', async () => {
      await request(app).post('/api/crash-rate').send({ crash_rate: 0.02, channel: 'production' });
      await request(app).post('/api/crash-rate').send({ crash_rate: 0.05, channel: 'production' });
      const res = await request(app).get('/api/crash-rate/current?channel=production');
      expect(res.status).toBe(200);
      expect(res.body.data.crash_rate).toBe(0.05);
    });
  });

  describe('GET /api/crash-rate/history', () => {
    it('returns empty array when no data', async () => {
      const res = await request(app).get('/api/crash-rate/history');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('returns crash rate records', async () => {
      await request(app).post('/api/crash-rate').send({ crash_rate: 0.01 });
      await request(app).post('/api/crash-rate').send({ crash_rate: 0.02 });
      const res = await request(app).get('/api/crash-rate/history');
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('DELETE /api/crash-rate', () => {
    it('clears all records', async () => {
      await request(app).post('/api/crash-rate').send({ crash_rate: 0.01 });
      await request(app).delete('/api/crash-rate');
      const res = await request(app).get('/api/crash-rate/history');
      expect(res.body.data).toHaveLength(0);
    });
  });
});
