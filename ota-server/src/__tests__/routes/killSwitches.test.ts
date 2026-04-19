import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import killSwitchesRouter from '../../routes/killSwitches.js';

const app = express();
app.use(express.json());
app.use('/api/kill-switches', killSwitchesRouter);

beforeEach(() => {
  testDb.exec('DELETE FROM kill_switches; DELETE FROM audit_log;');
});

describe('Kill Switches API', () => {
  describe('POST /api/kill-switches', () => {
    it('creates a kill switch', async () => {
      const res = await request(app).post('/api/kill-switches').send({ key: 'my_switch' });
      expect(res.status).toBe(201);
      expect(res.body.data.key).toBe('my_switch');
      expect(res.body.data.active).toBe(false);
    });

    it('rejects invalid key', async () => {
      const res = await request(app).post('/api/kill-switches').send({ key: 'Bad-Key' });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate key', async () => {
      await request(app).post('/api/kill-switches').send({ key: 'dup_switch' });
      const res = await request(app).post('/api/kill-switches').send({ key: 'dup_switch' });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/kill-switches', () => {
    it('returns empty list', async () => {
      const res = await request(app).get('/api/kill-switches');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('returns created switches', async () => {
      await request(app).post('/api/kill-switches').send({ key: 'switch_a' });
      const res = await request(app).get('/api/kill-switches');
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/kill-switches/:id/activate', () => {
    it('activates a switch', async () => {
      const create = await request(app).post('/api/kill-switches').send({ key: 'activate_me' });
      const id = create.body.data.id;
      const res = await request(app).post(`/api/kill-switches/${id}/activate`);
      expect(res.status).toBe(200);
      expect(res.body.data.active).toBe(true);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).post('/api/kill-switches/no-such-id/activate');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/kill-switches/:id/deactivate', () => {
    it('deactivates a switch', async () => {
      const create = await request(app).post('/api/kill-switches').send({ key: 'deactivate_me', active: true });
      const id = create.body.data.id;
      const res = await request(app).post(`/api/kill-switches/${id}/deactivate`);
      expect(res.status).toBe(200);
      expect(res.body.data.active).toBe(false);
    });
  });

  describe('DELETE /api/kill-switches/:id', () => {
    it('deletes a switch', async () => {
      const create = await request(app).post('/api/kill-switches').send({ key: 'delete_me' });
      const id = create.body.data.id;
      const del = await request(app).delete(`/api/kill-switches/${id}`);
      expect(del.status).toBe(200);
      const get = await request(app).get(`/api/kill-switches/${id}`);
      expect(get.status).toBe(404);
    });

    it('returns 404 for non-existent switch', async () => {
      const res = await request(app).delete('/api/kill-switches/ghost');
      expect(res.status).toBe(404);
    });
  });
});
