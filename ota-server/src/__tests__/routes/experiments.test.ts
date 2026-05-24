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
  testDb.exec('DELETE FROM experiment_exposures; DELETE FROM experiment_conversions; DELETE FROM experiments; DELETE FROM audit_log; DELETE FROM experiment_assignments;');
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

describe('Experiment exposure and conversion tracking', () => {
  async function createExperiment() {
    const res = await request(app).post('/api/experiments').send(validExp);
    expect(res.status).toBe(201);
    return res.body.data;
  }

  describe('POST /api/experiments/:key/expose', () => {
    it('records an exposure and returns ok:true', async () => {
      await createExperiment();
      const res = await request(app)
        .post('/api/experiments/my_experiment/expose')
        .send({ install_id: 'dev1', variant_id: 'control' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const row = testDb.prepare('SELECT * FROM experiment_exposures WHERE install_id = ?').get('dev1');
      expect(row).toBeTruthy();
    });

    it('is idempotent — second call does not create a second row', async () => {
      await createExperiment();
      const payload = { install_id: 'dev2', variant_id: 'control' };
      await request(app).post('/api/experiments/my_experiment/expose').send(payload);
      await request(app).post('/api/experiments/my_experiment/expose').send(payload);

      const rows = testDb.prepare('SELECT * FROM experiment_exposures WHERE install_id = ?').all('dev2');
      expect(rows).toHaveLength(1);
    });

    it('returns 404 for unknown experiment key', async () => {
      const res = await request(app)
        .post('/api/experiments/no_such_key/expose')
        .send({ install_id: 'dev3', variant_id: 'control' });
      expect(res.status).toBe(404);
    });

    it('returns 400 when required fields are missing', async () => {
      await createExperiment();
      const res = await request(app)
        .post('/api/experiments/my_experiment/expose')
        .send({ install_id: 'dev4' }); // missing variant_id
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/experiments/:key/convert', () => {
    it('records a conversion and returns ok:true', async () => {
      await createExperiment();
      const res = await request(app)
        .post('/api/experiments/my_experiment/convert')
        .send({ install_id: 'dev5', variant_id: 'control', event_name: 'purchase' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const row = testDb.prepare('SELECT * FROM experiment_conversions WHERE install_id = ?').get('dev5');
      expect(row).toBeTruthy();
    });

    it('records conversion with custom value', async () => {
      await createExperiment();
      await request(app)
        .post('/api/experiments/my_experiment/convert')
        .send({ install_id: 'dev6', variant_id: 'treatment', event_name: 'revenue', value: 9.99 });

      const row = testDb.prepare('SELECT value FROM experiment_conversions WHERE install_id = ?').get('dev6') as { value: number };
      expect(row.value).toBeCloseTo(9.99);
    });

    it('returns 404 for unknown experiment key', async () => {
      const res = await request(app)
        .post('/api/experiments/no_such_key/convert')
        .send({ install_id: 'dev7', variant_id: 'control', event_name: 'purchase' });
      expect(res.status).toBe(404);
    });

    it('returns 400 when required fields are missing', async () => {
      await createExperiment();
      const res = await request(app)
        .post('/api/experiments/my_experiment/convert')
        .send({ install_id: 'dev8', variant_id: 'control' }); // missing event_name
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/experiments/:key/results', () => {
    it('returns per-variant stats with exposures, conversions, rate, and winner', async () => {
      await createExperiment();

      // 2 control exposures, 1 conversion
      await request(app).post('/api/experiments/my_experiment/expose').send({ install_id: 'c1', variant_id: 'control' });
      await request(app).post('/api/experiments/my_experiment/expose').send({ install_id: 'c2', variant_id: 'control' });
      await request(app).post('/api/experiments/my_experiment/convert').send({ install_id: 'c1', variant_id: 'control', event_name: 'purchase' });

      // 2 treatment exposures, 2 conversions (100% vs 50% → lift > 10%)
      await request(app).post('/api/experiments/my_experiment/expose').send({ install_id: 't1', variant_id: 'treatment' });
      await request(app).post('/api/experiments/my_experiment/expose').send({ install_id: 't2', variant_id: 'treatment' });
      await request(app).post('/api/experiments/my_experiment/convert').send({ install_id: 't1', variant_id: 'treatment', event_name: 'purchase' });
      await request(app).post('/api/experiments/my_experiment/convert').send({ install_id: 't2', variant_id: 'treatment', event_name: 'purchase' });

      const res = await request(app).get('/api/experiments/my_experiment/results');
      expect(res.status).toBe(200);
      expect(res.body.variants).toHaveLength(2);

      const control = res.body.variants.find((v: { id: string }) => v.id === 'control');
      const treatment = res.body.variants.find((v: { id: string }) => v.id === 'treatment');

      expect(control.exposures).toBe(2);
      expect(control.conversions).toBe(1);
      expect(control.rate).toBeCloseTo(0.5);

      expect(treatment.exposures).toBe(2);
      expect(treatment.conversions).toBe(2);
      expect(treatment.rate).toBeCloseTo(1.0);

      expect(res.body.winner).toBe('treatment');
    });

    it('returns null winner when lift is below 10%', async () => {
      await createExperiment();

      // control: 2 exposures, 1 conversion (50%)
      await request(app).post('/api/experiments/my_experiment/expose').send({ install_id: 'c1', variant_id: 'control' });
      await request(app).post('/api/experiments/my_experiment/expose').send({ install_id: 'c2', variant_id: 'control' });
      await request(app).post('/api/experiments/my_experiment/convert').send({ install_id: 'c1', variant_id: 'control', event_name: 'purchase' });

      // treatment: 2 exposures, 1 conversion (50% — no lift)
      await request(app).post('/api/experiments/my_experiment/expose').send({ install_id: 't1', variant_id: 'treatment' });
      await request(app).post('/api/experiments/my_experiment/expose').send({ install_id: 't2', variant_id: 'treatment' });
      await request(app).post('/api/experiments/my_experiment/convert').send({ install_id: 't1', variant_id: 'treatment', event_name: 'purchase' });

      const res = await request(app).get('/api/experiments/my_experiment/results');
      expect(res.status).toBe(200);
      expect(res.body.winner).toBeNull();
    });

    it('returns 404 for unknown experiment key', async () => {
      const res = await request(app).get('/api/experiments/no_such_key/results');
      expect(res.status).toBe(404);
    });
  });
});
