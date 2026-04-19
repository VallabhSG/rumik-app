import { v4 as uuid } from 'uuid';
import db from '../db.js';

interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  channel: string;
  version: string | null;
  window_mins: number;
  cooldown_mins: number;
  enabled: number;
  webhook_url: string;
}

type Operator = 'gt' | 'lt' | 'gte' | 'lte';

function evaluate(value: number, operator: Operator, threshold: number): boolean {
  switch (operator) {
    case 'gt':  return value > threshold;
    case 'lt':  return value < threshold;
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
  }
}

function computeCrashRate(channel: string, version: string | null, windowMins: number): number {
  const since = new Date(Date.now() - windowMins * 60_000).toISOString();
  const conds = ['recorded_at >= ?'];
  const params: unknown[] = [since];

  if (channel) { conds.push('(channel = ? OR channel IS NULL)'); params.push(channel); }
  if (version) { conds.push('version = ?'); params.push(version); }

  const row = db.prepare(`
    SELECT AVG(crash_rate) as avg FROM crash_rates
    WHERE ${conds.join(' AND ')}
  `).get(...params) as { avg: number | null };

  return row?.avg ?? 0;
}

function computeAdoptionRate(channel: string, version: string | null, windowMins: number): number {
  const since = new Date(Date.now() - windowMins * 60_000).toISOString();
  const conds = ['recorded_at >= ?'];
  const params: unknown[] = [since];

  if (channel) { conds.push('channel = ?'); params.push(channel); }
  if (version) { conds.push('version = ?'); params.push(version); }

  const where = `WHERE ${conds.join(' AND ')}`;
  const rows = db.prepare(`
    SELECT event_type, COUNT(DISTINCT device_id) AS c
    FROM update_events ${where}
    GROUP BY event_type
  `).all(...params) as Array<{ event_type: string; c: number }>;

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.event_type] = r.c;

  const eligible = counts['eligible'] ?? 0;
  const applied  = counts['applied']  ?? 0;
  return eligible > 0 ? applied / eligible : 0;
}

function computeFailureRate(channel: string, version: string | null, windowMins: number): number {
  const since = new Date(Date.now() - windowMins * 60_000).toISOString();
  const conds = ['recorded_at >= ?'];
  const params: unknown[] = [since];

  if (channel) { conds.push('channel = ?'); params.push(channel); }
  if (version) { conds.push('version = ?'); params.push(version); }

  const where = `WHERE ${conds.join(' AND ')}`;
  const rows = db.prepare(`
    SELECT event_type, COUNT(*) AS c FROM update_events ${where}
    GROUP BY event_type
  `).all(...params) as Array<{ event_type: string; c: number }>;

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.event_type] = r.c;

  const downloading = counts['download_start'] ?? 0;
  const failed      = counts['failed']         ?? 0;
  return downloading > 0 ? failed / downloading : 0;
}

function computeP95(metricType: string, channel: string, version: string | null, windowMins: number): number {
  const since = new Date(Date.now() - windowMins * 60_000).toISOString();
  const conds = ['metric_type = ?', 'recorded_at >= ?'];
  const params: unknown[] = [metricType, since];

  if (channel) { conds.push('channel = ?'); params.push(channel); }
  if (version) { conds.push('version = ?'); params.push(version); }

  const where = `WHERE ${conds.join(' AND ')}`;
  const countRow = db.prepare(`SELECT COUNT(*) as c FROM perf_metrics ${where}`).get(...params) as { c: number };
  const count = countRow.c;
  if (count === 0) return 0;

  const offset = Math.max(0, Math.ceil(count * 0.95) - 1);
  const row = db.prepare(`
    SELECT value FROM perf_metrics ${where}
    ORDER BY value ASC LIMIT 1 OFFSET ?
  `).get(...params, offset) as { value: number } | undefined;

  return row?.value ?? 0;
}

function computeMetric(rule: AlertRule): number {
  switch (rule.metric) {
    case 'crash_rate':
      return computeCrashRate(rule.channel, rule.version, rule.window_mins);
    case 'adoption_rate':
      return computeAdoptionRate(rule.channel, rule.version, rule.window_mins);
    case 'failure_rate':
      return computeFailureRate(rule.channel, rule.version, rule.window_mins);
    case 'p95_startup_ms':
      return computeP95('startup_ms', rule.channel, rule.version, rule.window_mins);
    case 'p95_download_ms':
      return computeP95('update_download_ms', rule.channel, rule.version, rule.window_mins);
    default:
      return 0;
  }
}

function isInCooldown(ruleId: string, cooldownMins: number): boolean {
  const since = new Date(Date.now() - cooldownMins * 60_000).toISOString();
  const row = db.prepare(
    `SELECT 1 FROM alert_history WHERE rule_id = ? AND fired_at >= ? AND status = 'sent' LIMIT 1`,
  ).get(ruleId, since);
  return !!row;
}

async function sendWebhook(rule: AlertRule, value: number): Promise<'sent' | 'failed'> {
  const operatorLabel: Record<string, string> = { gt: '>', lt: '<', gte: '≥', lte: '≤' };
  const displayValue = rule.metric.endsWith('_ms')
    ? `${Math.round(value)}ms`
    : rule.metric.endsWith('_rate') || rule.metric === 'adoption_rate'
      ? `${(value * 100).toFixed(1)}%`
      : String(value);

  const displayThreshold = rule.metric.endsWith('_ms')
    ? `${Math.round(rule.threshold)}ms`
    : rule.metric.endsWith('_rate') || rule.metric === 'adoption_rate'
      ? `${(rule.threshold * 100).toFixed(1)}%`
      : String(rule.threshold);

  const payload = {
    text: `\u{1F6A8} Alert: *${rule.name}* triggered`,
    attachments: [{
      color: 'danger',
      fields: [
        { title: 'Rule',      value: rule.name,                                   short: true },
        { title: 'Metric',    value: rule.metric,                                 short: true },
        { title: 'Value',     value: displayValue,                                short: true },
        { title: 'Threshold', value: `${operatorLabel[rule.operator] ?? rule.operator} ${displayThreshold}`, short: true },
        { title: 'Channel',   value: rule.channel,                                short: true },
        { title: 'Version',   value: rule.version ?? 'any',                       short: true },
      ],
      footer: 'rumik-app OTA',
      ts: Math.floor(Date.now() / 1000),
    }],
  };

  try {
    const res = await fetch(rule.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

async function processRule(rule: AlertRule): Promise<void> {
  const value = computeMetric(rule);
  const breached = evaluate(value, rule.operator as Operator, rule.threshold);

  if (!breached) return;
  if (isInCooldown(rule.id, rule.cooldown_mins)) return;

  const now = new Date().toISOString();
  const status = await sendWebhook(rule, value);

  if (status === 'sent') {
    console.log(`[alertEngine] Fired alert "${rule.name}" — ${rule.metric} = ${value}`);
  } else {
    console.warn(`[alertEngine] Webhook failed for rule "${rule.name}"`);
  }

  db.prepare(`
    INSERT INTO alert_history (id, rule_id, metric_value, fired_at, payload, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), rule.id, value, now, JSON.stringify({ metric: rule.metric, value }), status);
}

export async function runAlertEngine(): Promise<void> {
  const rules = db.prepare(
    'SELECT * FROM alert_rules WHERE enabled = 1',
  ).all() as AlertRule[];

  await Promise.allSettled(rules.map(processRule));
}
