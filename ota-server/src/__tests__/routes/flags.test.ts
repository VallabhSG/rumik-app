import { createTestDb } from '../testApp.js';

// Create in-memory DB before any module imports run
const testDb = createTestDb();

jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import flagsRouter from '../../routes/flags.js';
import { actorMiddleware } from '../../middleware/actor.js';

const app = express();
app.use(express.json());
app.use('/api/flags', flagsRouter);

// Separate app that includes actor middleware for actor-identity tests
const actorApp = express();
actorApp.use(express.json());
actorApp.use(actorMiddleware);
actorApp.use('/api/flags', flagsRouter);

describe('Feature Flags API', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM feature_flags; DELETE FROM audit_log;');
  });

  describe('POST /api/flags', () => {
    it('creates a flag', async () => {
      const res = await request(app).post('/api/flags').send({ key: 'my_flag', enabled: true });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.key).toBe('my_flag');
      expect(res.body.data.enabled).toBe(true);
      expect(res.body.data.id).toBeDefined();
    });

    it('rejects invalid key (not snake_case)', async () => {
      const res = await request(app).post('/api/flags').send({ key: 'My-Flag' });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate key', async () => {
      await request(app).post('/api/flags').send({ key: 'dup_flag' });
      const res = await request(app).post('/api/flags').send({ key: 'dup_flag' });
      expect(res.status).toBe(409);
    });

    it('stores targeting rule as JSON', async () => {
      const targeting = { platforms: ['ios'], percentage: 50 };
      const res = await request(app).post('/api/flags').send({ key: 'targeted_flag', targeting });
      expect(res.status).toBe(201);
      expect(res.body.data.targeting).toEqual(targeting);
    });

    it('writes audit log on create', async () => {
      await request(app).post('/api/flags').send({ key: 'audit_test' });
      const entry = testDb.prepare("SELECT * FROM audit_log WHERE entity_type = 'flag'").get() as { action: string };
      expect(entry.action).toBe('created');
    });
  });

  describe('GET /api/flags', () => {
    it('returns empty list when no flags', async () => {
      const res = await request(app).get('/api/flags');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns all flags', async () => {
      await request(app).post('/api/flags').send({ key: 'flag_a' });
      await request(app).post('/api/flags').send({ key: 'flag_b' });
      const res = await request(app).get('/api/flags');
      expect(res.body.data).toHaveLength(2);
    });

    it('parses enabled as boolean (not integer)', async () => {
      await request(app).post('/api/flags').send({ key: 'bool_flag', enabled: true });
      const res = await request(app).get('/api/flags');
      expect(typeof res.body.data[0].enabled).toBe('boolean');
    });
  });

  describe('GET /api/flags/:id', () => {
    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/flags/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns the flag by id', async () => {
      const created = await request(app).post('/api/flags').send({ key: 'get_flag' });
      const id = created.body.data.id as string;
      const res = await request(app).get(`/api/flags/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.key).toBe('get_flag');
    });
  });

  describe('PATCH /api/flags/:id', () => {
    it('updates enabled status', async () => {
      const created = await request(app).post('/api/flags').send({ key: 'patch_flag', enabled: false });
      const id = created.body.data.id as string;
      const res = await request(app).patch(`/api/flags/${id}`).send({ enabled: true });
      expect(res.status).toBe(200);
      expect(res.body.data.enabled).toBe(true);
    });

    it('writes audit log on update', async () => {
      const created = await request(app).post('/api/flags').send({ key: 'update_audit' });
      const id = created.body.data.id as string;
      await request(app).patch(`/api/flags/${id}`).send({ enabled: true });
      const entries = testDb.prepare("SELECT * FROM audit_log WHERE entity_type = 'flag' ORDER BY created_at").all() as Array<{ action: string }>;
      expect(entries.some(e => e.action === 'updated')).toBe(true);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).patch('/api/flags/nonexistent').send({ enabled: true });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/flags/:id', () => {
    it('deletes the flag', async () => {
      const created = await request(app).post('/api/flags').send({ key: 'delete_me' });
      const id = created.body.data.id as string;
      const del = await request(app).delete(`/api/flags/${id}`);
      expect(del.status).toBe(200);
      const get = await request(app).get(`/api/flags/${id}`);
      expect(get.status).toBe(404);
    });

    it('returns 404 for already deleted flag', async () => {
      const res = await request(app).delete('/api/flags/ghost');
      expect(res.status).toBe(404);
    });
  });

  describe('Actor identity in audit log', () => {
    it('records actor from X-Actor header', async () => {
      await request(actorApp)
        .post('/api/flags')
        .set('X-Actor', 'test-admin')
        .send({ key: 'actor_flag_1' });
      const entry = testDb
        .prepare("SELECT * FROM audit_log WHERE entity_type = 'flag' ORDER BY created_at DESC LIMIT 1")
        .get() as { actor: string };
      expect(entry.actor).toBe('test-admin');
    });

    it('defaults actor to api when no X-Actor header', async () => {
      await request(actorApp)
        .post('/api/flags')
        .send({ key: 'actor_flag_2' });
      const entry = testDb
        .prepare("SELECT * FROM audit_log WHERE entity_type = 'flag' ORDER BY created_at DESC LIMIT 1")
        .get() as { actor: string };
      expect(entry.actor).toBe('api');
    });
  });
});
