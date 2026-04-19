import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import alertsRouter from '../../routes/alerts.js';

const app = express();
app.use(express.json());
app.use('/api/alerts', alertsRouter);

beforeEach(() => {
  testDb.exec('DELETE FROM alert_rules');
  testDb.exec('DELETE FROM alert_history');
});

const validRule = {
  name: 'High Crash Rate',
  metric: 'crash_rate',
  operator: 'gt',
  threshold: 0.05,
  channel: 'production',
  window_mins: 60,
  cooldown_mins: 30,
  webhook_url: 'https://hooks.slack.com/services/test',
};

describe('Alerts API', () => {
  describe('GET /api/alerts/rules', () => {
    it('returns empty array when no rules', async () => {
      const res = await request(app).get('/api/alerts/rules');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('returns created rules', async () => {
      await request(app).post('/api/alerts/rules').send(validRule);
      const res = await request(app).get('/api/alerts/rules');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('High Crash Rate');
    });
  });

  describe('POST /api/alerts/rules', () => {
    it('creates a rule and returns 201', async () => {
      const res = await request(app).post('/api/alerts/rules').send(validRule);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.enabled).toBe(1);
    });

    it('returns 400 for missing name', async () => {
      const { name: _n, ...body } = validRule;
      const res = await request(app).post('/api/alerts/rules').send(body);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid metric', async () => {
      const res = await request(app).post('/api/alerts/rules').send({
        ...validRule,
        metric: 'unknown_metric',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid webhook_url', async () => {
      const res = await request(app).post('/api/alerts/rules').send({
        ...validRule,
        webhook_url: 'not-a-url',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/alerts/rules/:id', () => {
    it('updates rule fields', async () => {
      const create = await request(app).post('/api/alerts/rules').send(validRule);
      const id = create.body.data.id;
      const res = await request(app).patch(`/api/alerts/rules/${id}`).send({ threshold: 0.1 });
      expect(res.status).toBe(200);
      expect(res.body.data.threshold).toBe(0.1);
    });

    it('can toggle enabled flag', async () => {
      const create = await request(app).post('/api/alerts/rules').send(validRule);
      const id = create.body.data.id;
      const res = await request(app).patch(`/api/alerts/rules/${id}`).send({ enabled: false });
      expect(res.status).toBe(200);
      expect(res.body.data.enabled).toBe(0);
    });

    it('returns 404 for non-existent rule', async () => {
      const res = await request(app).patch('/api/alerts/rules/no-such-id').send({ threshold: 0.1 });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/alerts/rules/:id', () => {
    it('deletes a rule', async () => {
      const create = await request(app).post('/api/alerts/rules').send(validRule);
      const id = create.body.data.id;
      const res = await request(app).delete(`/api/alerts/rules/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 for non-existent rule', async () => {
      const res = await request(app).delete('/api/alerts/rules/no-such-id');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/alerts/history', () => {
    it('returns empty when no history', async () => {
      const res = await request(app).get('/api/alerts/history');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.total).toBe(0);
    });

    it('returns history with pagination meta', async () => {
      const create = await request(app).post('/api/alerts/rules').send(validRule);
      const ruleId = create.body.data.id;
      testDb
        .prepare(
          'INSERT INTO alert_history (id, rule_id, metric_value, fired_at, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('hist-1', ruleId, 0.08, new Date().toISOString(), '{}', 'sent');

      const res = await request(app).get('/api/alerts/history');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].rule_name).toBe('High Crash Rate');
    });
  });
});
