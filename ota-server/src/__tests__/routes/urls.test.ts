import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import urlsRouter from '../../routes/urls.js';

const app = express();
app.use(express.json());
app.use('/api/urls', urlsRouter);

beforeEach(() => {
  testDb.exec('DELETE FROM dynamic_urls; DELETE FROM audit_log;');
});

describe('Dynamic URLs API', () => {
  describe('POST /api/urls', () => {
    it('creates a URL entry', async () => {
      const res = await request(app).post('/api/urls').send({ key: 'api_base', value: 'https://example.com/api' });
      expect(res.status).toBe(201);
      expect(res.body.data.key).toBe('api_base');
      expect(res.body.data.value).toBe('https://example.com/api');
    });

    it('rejects invalid key (not snake_case)', async () => {
      const res = await request(app).post('/api/urls').send({ key: 'Bad-Key', value: 'https://x.com' });
      expect(res.status).toBe(400);
    });

    it('rejects invalid URL value', async () => {
      const res = await request(app).post('/api/urls').send({ key: 'my_url', value: 'not-a-url' });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate key', async () => {
      await request(app).post('/api/urls').send({ key: 'dup_url', value: 'https://a.com' });
      const res = await request(app).post('/api/urls').send({ key: 'dup_url', value: 'https://b.com' });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/urls', () => {
    it('returns empty list', async () => {
      const res = await request(app).get('/api/urls');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('returns all URL entries', async () => {
      await request(app).post('/api/urls').send({ key: 'url_a', value: 'https://a.com' });
      await request(app).post('/api/urls').send({ key: 'url_b', value: 'https://b.com' });
      const res = await request(app).get('/api/urls');
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('GET /api/urls/:id', () => {
    it('returns URL by id', async () => {
      const create = await request(app).post('/api/urls').send({ key: 'get_url', value: 'https://c.com' });
      const id = create.body.data.id;
      const res = await request(app).get(`/api/urls/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.key).toBe('get_url');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/urls/no-such-id');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/urls/:id', () => {
    it('updates value', async () => {
      const create = await request(app).post('/api/urls').send({ key: 'patch_url', value: 'https://old.com' });
      const id = create.body.data.id;
      const res = await request(app).patch(`/api/urls/${id}`).send({ value: 'https://new.com' });
      expect(res.status).toBe(200);
      expect(res.body.data.value).toBe('https://new.com');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).patch('/api/urls/ghost').send({ value: 'https://x.com' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/urls/:id', () => {
    it('deletes a URL', async () => {
      const create = await request(app).post('/api/urls').send({ key: 'delete_url', value: 'https://d.com' });
      const id = create.body.data.id;
      const del = await request(app).delete(`/api/urls/${id}`);
      expect(del.status).toBe(200);
      const get = await request(app).get(`/api/urls/${id}`);
      expect(get.status).toBe(404);
    });

    it('returns 404 for non-existent URL', async () => {
      const res = await request(app).delete('/api/urls/ghost');
      expect(res.status).toBe(404);
    });
  });
});
