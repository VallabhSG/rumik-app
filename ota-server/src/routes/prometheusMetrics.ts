import { Router, Request, Response } from 'express';
import { Registry, collectDefaultMetrics, Gauge } from 'prom-client';
import db from '../db.js';

const router = Router();

const register = new Registry();
register.setDefaultLabels({ app: 'rumik-ota-server' });
collectDefaultMetrics({ register });

// Custom gauges
const activeReleasesGauge = new Gauge({
  name: 'ota_active_releases_total',
  help: 'Number of active OTA releases',
  labelNames: ['channel'],
  registers: [register],
});

const rolloutPctGauge = new Gauge({
  name: 'ota_rollout_percentage',
  help: 'Current rollout percentage per release',
  labelNames: ['version', 'channel'],
  registers: [register],
});

const crashRateGauge = new Gauge({
  name: 'ota_crash_rate_current',
  help: 'Latest crash rate per channel',
  labelNames: ['channel'],
  registers: [register],
});

const alertRulesGauge = new Gauge({
  name: 'ota_alert_rules_enabled_total',
  help: 'Number of enabled alert rules',
  registers: [register],
});

const errorGroupsGauge = new Gauge({
  name: 'ota_error_groups_open_total',
  help: 'Number of open error groups',
  registers: [register],
});

function refreshGauges(): void {
  // Active releases by channel
  const releases = db.prepare(
    "SELECT channel, COUNT(*) as cnt FROM releases WHERE status = 'active' GROUP BY channel"
  ).all() as Array<{ channel: string; cnt: number }>;
  activeReleasesGauge.reset();
  for (const r of releases) {
    activeReleasesGauge.set({ channel: r.channel }, r.cnt);
  }

  // Rollout percentage per active release
  const rollouts = db.prepare(
    "SELECT version, channel, rollout_percentage FROM releases WHERE status = 'active'"
  ).all() as Array<{ version: string; channel: string; rollout_percentage: number }>;
  rolloutPctGauge.reset();
  for (const r of rollouts) {
    rolloutPctGauge.set({ version: r.version, channel: r.channel }, r.rollout_percentage);
  }

  // Latest crash rate per channel
  const crashRates = db.prepare(`
    SELECT channel, crash_rate FROM crash_rates
    WHERE (channel, recorded_at) IN (
      SELECT channel, MAX(recorded_at) FROM crash_rates GROUP BY channel
    )
  `).all() as Array<{ channel: string; crash_rate: number }>;
  crashRateGauge.reset();
  for (const cr of crashRates) {
    crashRateGauge.set({ channel: cr.channel ?? 'production' }, cr.crash_rate);
  }

  // Alert rules enabled count
  const alertCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM alert_rules WHERE enabled = 1"
  ).get() as { cnt: number };
  alertRulesGauge.set(alertCount.cnt);

  // Open error groups
  const errorCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM error_groups WHERE status = 'open'"
  ).get() as { cnt: number };
  errorGroupsGauge.set(errorCount.cnt);
}

// GET /metrics
router.get('/', async (_req: Request, res: Response) => {
  try {
    refreshGauges();
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(String(err));
  }
});

export default router;
