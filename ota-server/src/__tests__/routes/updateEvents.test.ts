import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import updateEventsRouter from '../../routes/updateEvents.js';

const app = express();
app.use(express.json());
app.use('/api/update-events', updateEventsRouter);

beforeEach(() => {
  testDb.exec('DELETE FROM update_events');
});

const validPayload = {
  device_id: 'dev-1',
  release_id: 'rel-abc',
  version: '1.0.0',
  channel: 'production',
  platform: 'ios',
  events: [
    { event_type: 'eligible' },
    { event_type: 'download_start' },
    { event_type: 'applied' },
  ],
};

describe('Update Events API', () => {
  describe('POST /api/update-events', () => {
    it('inserts events and returns inserted count', async () => {
      const res = await request(app).post('/api/update-events').send(validPayload);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inserted).toBe(3);
    });

    it('returns 400 for missing device_id', async () => {
      const { device_id: _d, ...body } = validPayload;
      const res = await request(app).post('/api/update-events').send(body);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for unknown event_type', async () => {
      const res = await request(app).post('/api/update-events').send({
        ...validPayload,
        events: [{ event_type: 'unknown_event' }],
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for empty events array', async () => {
      const res = await request(app).post('/api/update-events').send({ ...validPayload, events: [] });
      expect(res.status).toBe(400);
    });

    it('stores error_msg on failed event', async () => {
      const res = await request(app).post('/api/update-events').send({
        ...validPayload,
        events: [{ event_type: 'failed', error_msg: 'network timeout' }],
      });
      expect(res.status).toBe(201);
      const row = testDb
        .prepare("SELECT * FROM update_events WHERE event_type = 'failed'")
        .get() as { error_msg: string };
      expect(row.error_msg).toBe('network timeout');
    });
  });

  describe('GET /api/update-events/funnel', () => {
    it('returns 400 when neither release_id nor version is provided', async () => {
      const res = await request(app).get('/api/update-events/funnel');
      expect(res.status).toBe(400);
    });

    it('returns funnel counts by event_type', async () => {
      await request(app).post('/api/update-events').send(validPayload);
      const res = await request(app).get('/api/update-events/funnel?release_id=rel-abc');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.funnel.eligible).toBe(1);
      expect(res.body.data.funnel.applied).toBe(1);
    });

    it('computes adoption_rate correctly', async () => {
      await request(app).post('/api/update-events').send(validPayload);
      const res = await request(app).get('/api/update-events/funnel?release_id=rel-abc');
      // 1 eligible, 1 applied → 1/1 = 1.0
      expect(res.body.data.adoption_rate).toBe(1);
    });

    it('computes failure_rate correctly', async () => {
      await request(app).post('/api/update-events').send({
        ...validPayload,
        events: [{ event_type: 'download_start' }, { event_type: 'failed' }],
      });
      const res = await request(app).get('/api/update-events/funnel?release_id=rel-abc');
      // 1 download_start, 1 failed → 1/1 = 1.0
      expect(res.body.data.failure_rate).toBe(1);
    });
  });

  describe('GET /api/update-events/timeseries', () => {
    it('returns 400 when neither release_id nor version provided', async () => {
      const res = await request(app).get('/api/update-events/timeseries');
      expect(res.status).toBe(400);
    });

    it('returns timeseries buckets', async () => {
      await request(app).post('/api/update-events').send(validPayload);
      const res = await request(app).get('/api/update-events/timeseries?release_id=rel-abc&hours=48');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
