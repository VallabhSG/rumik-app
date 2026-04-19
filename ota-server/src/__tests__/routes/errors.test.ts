import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import errorsRouter from '../../routes/errors.js';

const app = express();
app.use(express.json());
app.use('/api/errors', errorsRouter);

beforeEach(() => {
  testDb.exec('DELETE FROM error_events');
  testDb.exec('DELETE FROM error_groups');
});

const validPayload = {
  device_id: 'dev-1',
  version: '1.0.0',
  channel: 'production',
  platform: 'ios',
  error_type: 'TypeError',
  message: 'Cannot read properties of undefined',
  stack_trace: [
    { file: 'App.tsx', line: 42, column: 5, func: 'renderApp' },
    { file: 'HomeScreen.tsx', line: 18, column: 3, func: 'loadData' },
  ],
};

describe('Errors API', () => {
  describe('POST /api/errors', () => {
    it('creates an error group and returns 201', async () => {
      const res = await request(app).post('/api/errors').send(validPayload);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.group_id).toBeDefined();
      expect(res.body.data.is_new).toBe(true);
    });

    it('deduplicates same error into same group', async () => {
      const res1 = await request(app).post('/api/errors').send(validPayload);
      const res2 = await request(app).post('/api/errors').send(validPayload);
      expect(res1.body.data.group_id).toBe(res2.body.data.group_id);
      expect(res2.body.data.is_new).toBe(false);
    });

    it('returns 400 for missing error_type', async () => {
      const { error_type: _e, ...body } = validPayload;
      const res = await request(app).post('/api/errors').send(body);
      expect(res.status).toBe(400);
    });

    it('returns 400 for empty stack_trace', async () => {
      const res = await request(app).post('/api/errors').send({ ...validPayload, stack_trace: [] });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/errors/groups', () => {
    it('returns empty array when no groups', async () => {
      const res = await request(app).get('/api/errors/groups');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.total).toBe(0);
    });

    it('returns groups after ingest', async () => {
      await request(app).post('/api/errors').send(validPayload);
      const res = await request(app).get('/api/errors/groups');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].error_type).toBe('TypeError');
    });

    it('filters by status', async () => {
      await request(app).post('/api/errors').send(validPayload);
      const openRes = await request(app).get('/api/errors/groups?status=open');
      expect(openRes.body.data).toHaveLength(1);
      const resolvedRes = await request(app).get('/api/errors/groups?status=resolved');
      expect(resolvedRes.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/errors/groups/:id', () => {
    it('returns group detail with recent events', async () => {
      const createRes = await request(app).post('/api/errors').send(validPayload);
      const groupId = createRes.body.data.group_id;
      const res = await request(app).get(`/api/errors/groups/${groupId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.group.id).toBe(groupId);
      expect(Array.isArray(res.body.data.recent_events)).toBe(true);
      expect(res.body.data.recent_events).toHaveLength(1);
    });

    it('returns 404 for non-existent group', async () => {
      const res = await request(app).get('/api/errors/groups/no-such-id');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/errors/groups/:id', () => {
    it('updates status to resolved', async () => {
      const createRes = await request(app).post('/api/errors').send(validPayload);
      const groupId = createRes.body.data.group_id;
      const res = await request(app).patch(`/api/errors/groups/${groupId}`).send({ status: 'resolved' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
    });

    it('returns 400 for invalid status', async () => {
      const createRes = await request(app).post('/api/errors').send(validPayload);
      const groupId = createRes.body.data.group_id;
      const res = await request(app).patch(`/api/errors/groups/${groupId}`).send({ status: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent group', async () => {
      const res = await request(app).patch('/api/errors/groups/no-such-id').send({ status: 'resolved' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/errors/timeseries', () => {
    it('returns empty array when no events', async () => {
      const res = await request(app).get('/api/errors/timeseries');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('returns timeseries buckets after ingest', async () => {
      await request(app).post('/api/errors').send(validPayload);
      const res = await request(app).get('/api/errors/timeseries?hours=24');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });
});
