import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import releasesRouter from '../../routes/releases.js';

const app = express();
app.use(express.json());
app.use('/api/releases', releasesRouter);

beforeEach(() => {
  testDb.exec('DELETE FROM releases');
});

const validRelease = {
  version: '1.0.0',
  channel: 'production',
  platform: 'ios',
  rollout_percentage: 10,
};

describe('Releases API', () => {
  describe('POST /api/releases', () => {
    it('creates a release', async () => {
      const res = await request(app).post('/api/releases').send(validRelease);
      expect(res.status).toBe(201);
      expect(res.body.data.version).toBe('1.0.0');
      expect(res.body.data.channel).toBe('production');
    });

    it('returns 400 for missing version', async () => {
      const { version: _v, ...body } = validRelease;
      const res = await request(app).post('/api/releases').send(body);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid platform', async () => {
      const res = await request(app).post('/api/releases').send({ ...validRelease, platform: 'windows' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/releases', () => {
    it('returns empty list', async () => {
      const res = await request(app).get('/api/releases');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('returns created releases', async () => {
      await request(app).post('/api/releases').send(validRelease);
      const res = await request(app).get('/api/releases');
      expect(res.body.data).toHaveLength(1);
    });

    it('filters by channel', async () => {
      await request(app).post('/api/releases').send(validRelease);
      await request(app).post('/api/releases').send({ ...validRelease, channel: 'staging' });
      const res = await request(app).get('/api/releases?channel=staging');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].channel).toBe('staging');
    });
  });

  describe('GET /api/releases/current', () => {
    it('returns 404 when no active release', async () => {
      const res = await request(app).get('/api/releases/current?channel=production');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns the active release with highest rollout', async () => {
      await request(app).post('/api/releases').send({ ...validRelease, rollout_percentage: 10 });
      await request(app).post('/api/releases').send({ ...validRelease, version: '1.1.0', rollout_percentage: 50 });
      const res = await request(app).get('/api/releases/current?channel=production&platform=ios');
      expect(res.status).toBe(200);
      expect(res.body.data.version).toBe('1.1.0');
    });
  });

  describe('GET /api/releases/:id', () => {
    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/releases/no-such-id');
      expect(res.status).toBe(404);
    });

    it('returns release by id', async () => {
      const create = await request(app).post('/api/releases').send(validRelease);
      const id = create.body.data.id;
      const res = await request(app).get(`/api/releases/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.version).toBe('1.0.0');
    });
  });

  describe('PATCH /api/releases/:id', () => {
    it('updates rollout_percentage', async () => {
      const create = await request(app).post('/api/releases').send(validRelease);
      const id = create.body.data.id;
      const res = await request(app).patch(`/api/releases/${id}`).send({ rollout_percentage: 50 });
      expect(res.status).toBe(200);
      expect(res.body.data.rollout_percentage).toBe(50);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).patch('/api/releases/ghost').send({ rollout_percentage: 50 });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/releases/:id', () => {
    it('soft-deletes a release (sets status to rolled_back)', async () => {
      const create = await request(app).post('/api/releases').send(validRelease);
      const id = create.body.data.id;
      const del = await request(app).delete(`/api/releases/${id}`);
      expect(del.status).toBe(200);
      expect(del.body.data.status).toBe('rolled_back');
      // Release still exists, just with rolled_back status
      const get = await request(app).get(`/api/releases/${id}`);
      expect(get.status).toBe(200);
    });

    it('returns 404 for non-existent release', async () => {
      const res = await request(app).delete('/api/releases/ghost');
      expect(res.status).toBe(404);
    });
  });
});
