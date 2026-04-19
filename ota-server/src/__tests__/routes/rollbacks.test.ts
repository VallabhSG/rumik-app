import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import rollbacksRouter from '../../routes/rollbacks.js';

const app = express();
app.use(express.json());
app.use('/api/rollbacks', rollbacksRouter);

beforeEach(() => {
  testDb.exec('DELETE FROM rollbacks; DELETE FROM releases;');
});

describe('Rollbacks API', () => {
  describe('GET /api/rollbacks', () => {
    it('returns empty list when no rollbacks', async () => {
      const res = await request(app).get('/api/rollbacks');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('POST /api/rollbacks', () => {
    it('creates a rollback record', async () => {
      const res = await request(app).post('/api/rollbacks').send({
        target_version: '1.0.0',
        reason: 'High crash rate detected',
        channels: 'production',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.target_version).toBe('1.0.0');
      expect(res.body.data.status).toBe('completed');
    });

    it('returns 400 for missing target_version', async () => {
      const res = await request(app).post('/api/rollbacks').send({
        reason: 'crash rate too high',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing reason', async () => {
      const res = await request(app).post('/api/rollbacks').send({
        target_version: '1.0.0',
      });
      expect(res.status).toBe(400);
    });

    it('ignores dev-runtime rollbacks (exposdk: in reason)', async () => {
      const res = await request(app).post('/api/rollbacks').send({
        target_version: '1.0.0',
        reason: 'exposdk:49.0.0 crash',
        channels: 'production',
      });
      // Should still return 201 but not deactivate real releases
      expect(res.status).toBe(201);
      const rollbacks = testDb
        .prepare("SELECT * FROM rollbacks WHERE reason LIKE '%exposdk%'")
        .all() as Array<{ target_version: string }>;
      expect(rollbacks).toHaveLength(1);
    });

    it('records from_version when an active release exists', async () => {
      // Seed an active release
      testDb.prepare(`
        INSERT INTO releases (id, version, channel, platform, rollout_percentage, is_rollback, status, created_at, updated_at)
        VALUES ('rel-1', '2.0.0', 'production', 'all', 100, 0, 'active', ?, ?)
      `).run(new Date().toISOString(), new Date().toISOString());

      const res = await request(app).post('/api/rollbacks').send({
        target_version: '1.9.0',
        reason: 'rollback needed',
        channels: 'production',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.from_version).toBe('2.0.0');
    });

    it('returns list of rollbacks after creation', async () => {
      await request(app).post('/api/rollbacks').send({ target_version: '1.0.0', reason: 'test' });
      const res = await request(app).get('/api/rollbacks');
      expect(res.body.data).toHaveLength(1);
    });
  });
});
