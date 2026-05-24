import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import schedulesRouter from '../../routes/schedules.js';

const app = express();
app.use(express.json());
app.use('/api/schedules', schedulesRouter);

const FUTURE_DATE = '2099-12-31T23:59:59.000Z';
const PAST_DATE = '2020-01-01T00:00:00.000Z';

function makeSchedule(overrides: Record<string, unknown> = {}) {
  return {
    entity_type: 'flag',
    entity_id: 'flag-abc',
    action: 'activate',
    scheduled_at: FUTURE_DATE,
    created_by: 'test',
    ...overrides,
  };
}

function insertExecuted(id: string) {
  const now = new Date().toISOString();
  testDb.prepare(`
    INSERT INTO flag_schedules (id, entity_type, entity_id, action, scheduled_at, executed_at, created_by, created_at)
    VALUES (?, 'flag', 'flag-xyz', 'deactivate', ?, ?, 'system', ?)
  `).run(id, PAST_DATE, now, now);
}

describe('Schedules API', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM flag_schedules;');
  });

  describe('GET /api/schedules', () => {
    it('returns empty list when no schedules exist', async () => {
      const res = await request(app).get('/api/schedules');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns all schedules', async () => {
      await request(app).post('/api/schedules').send(makeSchedule());
      await request(app).post('/api/schedules').send(makeSchedule({ entity_type: 'experiment', action: 'activate' }));
      const res = await request(app).get('/api/schedules');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('filters by entity_type', async () => {
      await request(app).post('/api/schedules').send(makeSchedule({ entity_type: 'flag' }));
      await request(app).post('/api/schedules').send(makeSchedule({ entity_type: 'experiment', action: 'activate' }));
      await request(app).post('/api/schedules').send(makeSchedule({ entity_type: 'kill_switch' }));

      const res = await request(app).get('/api/schedules?entity_type=flag');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].entity_type).toBe('flag');
    });

    it('filters pending=true returns only unexecuted schedules', async () => {
      await request(app).post('/api/schedules').send(makeSchedule());
      insertExecuted('executed-1');

      const res = await request(app).get('/api/schedules?pending=true');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].executed_at).toBeNull();
    });
  });

  describe('GET /api/schedules/:id', () => {
    it('returns the schedule by id', async () => {
      const created = await request(app).post('/api/schedules').send(makeSchedule());
      const id = created.body.data.id as string;

      const res = await request(app).get(`/api/schedules/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(id);
      expect(res.body.data.entity_type).toBe('flag');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/schedules/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/schedules', () => {
    it('creates a valid schedule', async () => {
      const res = await request(app).post('/api/schedules').send(makeSchedule());
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.entity_type).toBe('flag');
      expect(res.body.data.action).toBe('activate');
      expect(res.body.data.executed_at).toBeNull();
    });

    it('creates a schedule with payload', async () => {
      const payload = { targeting: { platforms: ['ios'] } };
      const res = await request(app).post('/api/schedules').send(
        makeSchedule({ action: 'update_targeting', payload })
      );
      expect(res.status).toBe(201);
      expect(res.body.data.payload).toEqual(payload);
    });

    it('returns 400 for invalid entity_type', async () => {
      const res = await request(app).post('/api/schedules').send(
        makeSchedule({ entity_type: 'unknown' })
      );
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for invalid action', async () => {
      const res = await request(app).post('/api/schedules').send(
        makeSchedule({ action: 'invalid_action' })
      );
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for missing scheduled_at', async () => {
      const { scheduled_at, ...body } = makeSchedule();
      const res = await request(app).post('/api/schedules').send(body);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for invalid datetime format in scheduled_at', async () => {
      const res = await request(app).post('/api/schedules').send(
        makeSchedule({ scheduled_at: 'not-a-date' })
      );
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/schedules/:id', () => {
    it('deletes a pending schedule and returns 200', async () => {
      const created = await request(app).post('/api/schedules').send(makeSchedule());
      const id = created.body.data.id as string;

      const del = await request(app).delete(`/api/schedules/${id}`);
      expect(del.status).toBe(200);
      expect(del.body.success).toBe(true);

      const get = await request(app).get(`/api/schedules/${id}`);
      expect(get.status).toBe(404);
    });

    it('returns 409 when trying to delete an already-executed schedule', async () => {
      insertExecuted('exec-del-test');

      const res = await request(app).delete('/api/schedules/exec-del-test');
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/already-executed/i);
    });

    it('returns 404 for unknown schedule id', async () => {
      const res = await request(app).delete('/api/schedules/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
