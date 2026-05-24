import { createTestDb } from '../testApp.js';

const testDb = createTestDb();
jest.mock('../../db.js', () => testDb);

import request from 'supertest';
import express from 'express';
import configRouter from '../../routes/config.js';

const app = express();
app.use(express.json());
app.use('/api/config', configRouter);

const BASE_QUERY = '?platform=ios&native_version=1.5.0&install_id=device-abc123';

describe('Config endpoint', () => {
  beforeEach(() => {
    testDb.exec(`
      DELETE FROM feature_flags;
      DELETE FROM experiments;
      DELETE FROM dynamic_urls;
      DELETE FROM kill_switches;
      DELETE FROM experiment_assignments;
    `);
  });

  it('requires platform, native_version, install_id', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(400);
  });

  it('returns empty config when nothing configured', async () => {
    const res = await request(app).get('/api/config' + BASE_QUERY);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.flags).toEqual({});
    expect(res.body.data.experiments).toEqual({});
    expect(res.body.data.urls).toEqual({});
    expect(res.body.data.kill_switches).toEqual([]);
    expect(res.body.data.ttl).toBeGreaterThan(0);
    expect(res.body.data.version).toBeDefined();
  });

  describe('feature flags', () => {
    it('returns enabled flag', () => {
      const now = new Date().toISOString();
      testDb.prepare('INSERT INTO feature_flags (id, key, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('f1', 'new_ui', 1, now, now);
      return request(app).get('/api/config' + BASE_QUERY).then(res => {
        expect(res.body.data.flags.new_ui).toBe(true);
      });
    });

    it('returns false for disabled flag', () => {
      const now = new Date().toISOString();
      testDb.prepare('INSERT INTO feature_flags (id, key, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('f2', 'off_flag', 0, now, now);
      return request(app).get('/api/config' + BASE_QUERY).then(res => {
        expect(res.body.data.flags.off_flag).toBe(false);
      });
    });

    it('respects platform targeting', () => {
      const now = new Date().toISOString();
      const targeting = JSON.stringify({ platforms: ['android'] });
      testDb.prepare('INSERT INTO feature_flags (id, key, enabled, targeting, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('f3', 'android_only', 1, targeting, now, now);
      return request(app).get('/api/config' + BASE_QUERY).then(res => {
        // platform=ios, targeting=android — should be false
        expect(res.body.data.flags.android_only).toBe(false);
      });
    });
  });

  describe('kill switches', () => {
    it('returns active kill switch', () => {
      const now = new Date().toISOString();
      testDb.prepare('INSERT INTO kill_switches (id, key, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('ks1', 'payments', 1, now, now);
      return request(app).get('/api/config' + BASE_QUERY).then(res => {
        expect(res.body.data.kill_switches).toContain('payments');
      });
    });

    it('does not return inactive kill switch', () => {
      const now = new Date().toISOString();
      testDb.prepare('INSERT INTO kill_switches (id, key, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('ks2', 'search', 0, now, now);
      return request(app).get('/api/config' + BASE_QUERY).then(res => {
        expect(res.body.data.kill_switches).not.toContain('search');
      });
    });
  });

  describe('experiments', () => {
    it('assigns a variant from active experiment', () => {
      const now = new Date().toISOString();
      const variants = JSON.stringify([{ id: 'control', weight: 50 }, { id: 'treatment', weight: 50 }]);
      testDb.prepare('INSERT INTO experiments (id, key, status, variants, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('e1', 'onboarding', 'active', variants, now, now);
      return request(app).get('/api/config' + BASE_QUERY).then(res => {
        const variant = res.body.data.experiments.onboarding as string;
        expect(['control', 'treatment']).toContain(variant);
      });
    });

    it('assigns stable variant — same device always gets same bucket', async () => {
      const now = new Date().toISOString();
      const variants = JSON.stringify([{ id: 'a', weight: 50 }, { id: 'b', weight: 50 }]);
      testDb.prepare('INSERT INTO experiments (id, key, status, variants, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('e2', 'stable_exp', 'active', variants, now, now);

      const r1 = await request(app).get('/api/config' + BASE_QUERY);
      const r2 = await request(app).get('/api/config' + BASE_QUERY);
      expect(r1.body.data.experiments.stable_exp).toBe(r2.body.data.experiments.stable_exp);
    });

    it('does not assign variant from draft experiment', () => {
      const now = new Date().toISOString();
      const variants = JSON.stringify([{ id: 'a', weight: 50 }, { id: 'b', weight: 50 }]);
      testDb.prepare('INSERT INTO experiments (id, key, status, variants, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('e3', 'draft_exp', 'draft', variants, now, now);
      return request(app).get('/api/config' + BASE_QUERY).then(res => {
        expect(res.body.data.experiments.draft_exp).toBeUndefined();
      });
    });
  });

  describe('dynamic URLs', () => {
    it('returns URL when targeting matches', () => {
      const now = new Date().toISOString();
      testDb.prepare('INSERT INTO dynamic_urls (id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('u1', 'api_base', 'https://api.rumik.app', now, now);
      return request(app).get('/api/config' + BASE_QUERY).then(res => {
        expect(res.body.data.urls.api_base).toBe('https://api.rumik.app');
      });
    });
  });

  describe('user context targeting', () => {
    it('user plan parameter filters flags with user_attribute_rules targeting', async () => {
      const now = new Date().toISOString();
      const targeting = JSON.stringify({
        user_attribute_rules: [{ attribute: 'plan', operator: 'eq', value: 'premium' }],
      });
      testDb.prepare('INSERT INTO feature_flags (id, key, enabled, targeting, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('f-plan', 'premium_feature', 1, targeting, now, now);

      // free user — flag should be off
      const resFree = await request(app).get('/api/config' + BASE_QUERY + '&plan=free');
      expect(resFree.status).toBe(200);
      expect(resFree.body.data.flags.premium_feature).toBe(false);

      // premium user — flag should be on
      const resPremium = await request(app).get('/api/config' + BASE_QUERY + '&plan=premium');
      expect(resPremium.status).toBe(200);
      expect(resPremium.body.data.flags.premium_feature).toBe(true);

      testDb.exec("DELETE FROM feature_flags WHERE id = 'f-plan'");
    });

    it('kill switches with platform targeting only activate on matching platform', async () => {
      const now = new Date().toISOString();
      const targeting = JSON.stringify({ platforms: ['ios'] });
      testDb.prepare('INSERT INTO kill_switches (id, key, active, targeting, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('ks-ios', 'ios_payment_bug', 1, targeting, now, now);

      // ios request — kill switch should activate
      const resIos = await request(app).get('/api/config?platform=ios&native_version=1.5.0&install_id=device-ios');
      expect(resIos.status).toBe(200);
      expect(resIos.body.data.kill_switches).toContain('ios_payment_bug');

      // android request — kill switch should NOT activate
      const resAndroid = await request(app).get('/api/config?platform=android&native_version=1.5.0&install_id=device-android');
      expect(resAndroid.status).toBe(200);
      expect(resAndroid.body.data.kill_switches).not.toContain('ios_payment_bug');

      testDb.exec("DELETE FROM kill_switches WHERE id = 'ks-ios'");
    });
  });

  describe('version fingerprint', () => {
    it('returns consistent version for same config', async () => {
      const r1 = await request(app).get('/api/config' + BASE_QUERY);
      const r2 = await request(app).get('/api/config' + BASE_QUERY);
      expect(r1.body.data.version).toBe(r2.body.data.version);
    });

    it('returns different version when config changes', async () => {
      const r1 = await request(app).get('/api/config' + BASE_QUERY);
      const now = new Date().toISOString();
      testDb.prepare('INSERT INTO kill_switches (id, key, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('ks3', 'new_feature', 1, now, now);
      const r2 = await request(app).get('/api/config' + BASE_QUERY);
      expect(r1.body.data.version).not.toBe(r2.body.data.version);
    });
  });
});
