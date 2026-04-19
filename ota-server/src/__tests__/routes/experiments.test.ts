import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import experimentsRouter from '../../routes/experiments.js';

const app = express();
app.use(express.json());
app.use('/api/experiments', experimentsRouter);

beforeEach(() => {
  testDb.exec('DELETE FROM experiments; DELETE FROM audit_log; DELETE FROM experiment_assignments;');
});

const validExp = {
  key: 'my_experiment',
  variants: [
    { id: 'control', weight: 50 },
    { id: 'treatment', weight: 50 },
  ],
};

describe('Experiments API', () => {
  describe('POST /api/experiments', () => {
    it('creates an experiment', async () => {
      const res = await request(app).post('/api/experiments').send(validExp);
      expect(res.status).toBe(201);
      expect(res.body.data.key).toBe('my_experiment');
      expect(res.body.data.variants).toHaveLength(2);
      expect(res.body.data.status).toBe('draft');
    });

    it('rejects fewer than 2 variants', async () => {
      const res = await request(app).post('/api/experiments').send({ ...validExp, variants: [{ id: 'only', weight: 100 }] });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate key', async () => {
      await request(app).post('/api/experiments').send(validExp);
      const res = await request(app).post('/api/experiments').send(validExp);
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/experiments', () => {
    it('returns empty list', async () => {
      const res = await request(app).get('/api/experiments');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('returns experiments', async () => {
      await request(app).post('/api/experiments').send(validExp);
      const res = await request(app).get('/api/experiments');
      expect(res.body.data).toHaveLength(1);
    });

    it('filters by status', async () => {
      await request(app).post('/api/experiments').send(validExp);
      const draftRes = await request(app).get('/api/experiments?status=draft');
      expect(draftRes.body.data).toHaveLength(1);
      const activeRes = await request(app).get('/api/experiments?status=active');
      expect(activeRes.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/experiments/:id', () => {
    it('returns experiment by id', async () => {
      const create = await request(app).post('/api/experiments').send(validExp);
      const id = create.body.data.id;
      const res = await request(app).get(`/api/experiments/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.key).toBe('my_experiment');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/experiments/no-such-id');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/experiments/:id', () => {
    it('updates status', async () => {
      const create = await request(app).post('/api/experiments').send(validExp);
      const id = create.body.data.id;
      const res = await request(app).patch(`/api/experiments/${id}`).send({ status: 'active' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).patch('/api/experiments/ghost').send({ status: 'active' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/experiments/:id', () => {
    it('deletes an experiment', async () => {
      const create = await request(app).post('/api/experiments').send(validExp);
      const id = create.body.data.id;
      const del = await request(app).delete(`/api/experiments/${id}`);
      expect(del.status).toBe(200);
      const get = await request(app).get(`/api/experiments/${id}`);
      expect(get.status).toBe(404);
    });

    it('returns 404 for non-existent experiment', async () => {
      const res = await request(app).delete('/api/experiments/ghost');
      expect(res.status).toBe(404);
    });
  });
});
