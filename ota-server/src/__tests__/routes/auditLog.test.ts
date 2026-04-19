import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import auditLogRouter from '../../routes/auditLog.js';

const app = express();
app.use(express.json());
app.use('/api/audit', auditLogRouter);

beforeEach(() => {
  testDb.exec('DELETE FROM audit_log');
});

function seedEntry(entityType = 'flag', entityId = 'e1', action = 'created') {
  testDb.prepare(
    'INSERT INTO audit_log (id, entity_type, entity_id, action, changes, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(`audit-${Date.now()}-${Math.random()}`, entityType, entityId, action, null, 'api', new Date().toISOString());
}

describe('Audit Log API', () => {
  describe('GET /api/audit', () => {
    it('returns empty list when no entries', async () => {
      const res = await request(app).get('/api/audit');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.total).toBe(0);
    });

    it('returns audit entries', async () => {
      seedEntry('flag', 'flag-1', 'created');
      seedEntry('flag', 'flag-1', 'updated');
      const res = await request(app).get('/api/audit');
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('filters by entity_type', async () => {
      seedEntry('flag', 'f1', 'created');
      seedEntry('kill_switch', 'k1', 'created');
      const res = await request(app).get('/api/audit?entity_type=flag');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].entity_type).toBe('flag');
    });

    it('filters by entity_id', async () => {
      seedEntry('flag', 'id-abc', 'created');
      seedEntry('flag', 'id-xyz', 'created');
      const res = await request(app).get('/api/audit?entity_id=id-abc');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].entity_id).toBe('id-abc');
    });

    it('respects limit and offset', async () => {
      for (let i = 0; i < 5; i++) seedEntry('flag', `f${i}`, 'created');
      const res = await request(app).get('/api/audit?limit=3&offset=0');
      expect(res.body.data).toHaveLength(3);
      expect(res.body.meta.limit).toBe(3);
    });
  });
});
