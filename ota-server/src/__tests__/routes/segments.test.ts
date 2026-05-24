import { createTestDb } from '../testApp.js';

// Create in-memory DB before any module imports run
const testDb = createTestDb();

jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import segmentsRouter from '../../routes/segments.js';

const app = express();
app.use(express.json());
app.use('/api/segments', segmentsRouter);

describe('Segments API', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM segments;');
  });

  describe('GET /api/segments', () => {
    it('returns empty list when no segments exist', async () => {
      const res = await request(app).get('/api/segments');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns all segments', async () => {
      await request(app).post('/api/segments').send({ key: 'seg_a', name: 'Seg A', rules: [] });
      await request(app).post('/api/segments').send({ key: 'seg_b', name: 'Seg B', rules: [] });
      const res = await request(app).get('/api/segments');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('returns rules as parsed array (not a string)', async () => {
      const rules = [{ attribute: 'plan', operator: 'eq', value: 'premium' }];
      await request(app).post('/api/segments').send({ key: 'rules_seg', name: 'Rules Seg', rules });
      const res = await request(app).get('/api/segments');
      expect(Array.isArray(res.body.data[0].rules)).toBe(true);
    });
  });

  describe('GET /api/segments/:id', () => {
    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/api/segments/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns segment by id', async () => {
      const created = await request(app).post('/api/segments').send({ key: 'get_seg', name: 'Get Seg', rules: [] });
      const id = created.body.data.id as string;
      const res = await request(app).get(`/api/segments/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.key).toBe('get_seg');
    });
  });

  describe('POST /api/segments', () => {
    it('creates a segment with rules', async () => {
      const res = await request(app).post('/api/segments').send({
        key: 'premium_users',
        name: 'Premium Users',
        rules: [{ attribute: 'plan', operator: 'eq', value: 'premium' }],
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.key).toBe('premium_users');
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.rules).toHaveLength(1);
    });

    it('creates a segment with no rules', async () => {
      const res = await request(app).post('/api/segments').send({ key: 'empty_seg', name: 'Empty', rules: [] });
      expect(res.status).toBe(201);
      expect(res.body.data.rules).toEqual([]);
    });

    it('rejects invalid key (uppercase)', async () => {
      const res = await request(app).post('/api/segments').send({ key: 'InvalidKey', name: 'Bad', rules: [] });
      expect(res.status).toBe(400);
    });

    it('rejects key with hyphens', async () => {
      const res = await request(app).post('/api/segments').send({ key: 'bad-key', name: 'Bad', rules: [] });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate key', async () => {
      await request(app).post('/api/segments').send({ key: 'dup_seg', name: 'Dup', rules: [] });
      const res = await request(app).post('/api/segments').send({ key: 'dup_seg', name: 'Dup 2', rules: [] });
      expect(res.status).toBe(409);
    });

    it('rejects missing name', async () => {
      const res = await request(app).post('/api/segments').send({ key: 'no_name', rules: [] });
      expect(res.status).toBe(400);
    });

    it('rejects invalid rule attribute', async () => {
      const res = await request(app).post('/api/segments').send({
        key: 'bad_rule',
        name: 'Bad Rule',
        rules: [{ attribute: 'invalid_attr', operator: 'eq', value: 'x' }],
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/segments/:id', () => {
    it('updates segment name', async () => {
      const created = await request(app).post('/api/segments').send({ key: 'patch_seg', name: 'Old Name', rules: [] });
      const id = created.body.data.id as string;
      const res = await request(app).patch(`/api/segments/${id}`).send({ name: 'New Name' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('New Name');
    });

    it('updates segment rules', async () => {
      const created = await request(app).post('/api/segments').send({ key: 'rule_patch', name: 'Seg', rules: [] });
      const id = created.body.data.id as string;
      const newRules = [{ attribute: 'plan', operator: 'eq', value: 'premium' }];
      const res = await request(app).patch(`/api/segments/${id}`).send({ rules: newRules });
      expect(res.status).toBe(200);
      expect(res.body.data.rules).toHaveLength(1);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).patch('/api/segments/ghost').send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/segments/:id', () => {
    it('deletes the segment', async () => {
      const created = await request(app).post('/api/segments').send({ key: 'del_seg', name: 'Del', rules: [] });
      const id = created.body.data.id as string;
      const del = await request(app).delete(`/api/segments/${id}`);
      expect(del.status).toBe(200);
      const get = await request(app).get(`/api/segments/${id}`);
      expect(get.status).toBe(404);
    });

    it('returns 404 for already deleted segment', async () => {
      const res = await request(app).delete('/api/segments/ghost');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/segments/:id/test', () => {
    it('returns matches: true for a user that satisfies all rules', async () => {
      const created = await request(app).post('/api/segments').send({
        key: 'premium_match',
        name: 'Premium Match',
        rules: [{ attribute: 'plan', operator: 'eq', value: 'premium' }],
      });
      const id = created.body.data.id as string;
      const res = await request(app).post(`/api/segments/${id}/test`).send({ plan: 'premium' });
      expect(res.status).toBe(200);
      expect(res.body.data.matches).toBe(true);
      expect(res.body.data.failed_rules).toHaveLength(0);
    });

    it('returns matches: false with failed_rules for a non-matching user', async () => {
      const created = await request(app).post('/api/segments').send({
        key: 'premium_no_match',
        name: 'Premium No Match',
        rules: [{ attribute: 'plan', operator: 'eq', value: 'premium' }],
      });
      const id = created.body.data.id as string;
      const res = await request(app).post(`/api/segments/${id}/test`).send({ plan: 'free' });
      expect(res.status).toBe(200);
      expect(res.body.data.matches).toBe(false);
      expect(res.body.data.failed_rules).toHaveLength(1);
    });

    it('matches user satisfying multiple rules (AND semantics)', async () => {
      const created = await request(app).post('/api/segments').send({
        key: 'multi_rule',
        name: 'Multi Rule',
        rules: [
          { attribute: 'plan', operator: 'eq', value: 'premium' },
          { attribute: 'account_age_days', operator: 'gt', value: 30 },
        ],
      });
      const id = created.body.data.id as string;
      const res = await request(app).post(`/api/segments/${id}/test`).send({ plan: 'premium', account_age_days: 90 });
      expect(res.status).toBe(200);
      expect(res.body.data.matches).toBe(true);
    });

    it('fails when only one of multiple rules matches', async () => {
      const created = await request(app).post('/api/segments').send({
        key: 'partial_match',
        name: 'Partial Match',
        rules: [
          { attribute: 'plan', operator: 'eq', value: 'premium' },
          { attribute: 'account_age_days', operator: 'gt', value: 30 },
        ],
      });
      const id = created.body.data.id as string;
      const res = await request(app).post(`/api/segments/${id}/test`).send({ plan: 'premium', account_age_days: 5 });
      expect(res.status).toBe(200);
      expect(res.body.data.matches).toBe(false);
      expect(res.body.data.failed_rules).toHaveLength(1);
    });

    it('matches with empty rules (always true)', async () => {
      const created = await request(app).post('/api/segments').send({ key: 'always_true', name: 'Always', rules: [] });
      const id = created.body.data.id as string;
      const res = await request(app).post(`/api/segments/${id}/test`).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.matches).toBe(true);
    });

    it('returns 404 for unknown segment id', async () => {
      const res = await request(app).post('/api/segments/ghost/test').send({ plan: 'premium' });
      expect(res.status).toBe(404);
    });
  });
});
