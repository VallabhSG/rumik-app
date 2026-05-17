import db from '../db.js';
import logger from '../logger.js';

const DATA_RETENTION_DAYS = Number(process.env.DATA_RETENTION_DAYS ?? 30);
const ALERT_HISTORY_RETENTION_DAYS = 90;
const ERROR_EVENTS_RETENTION_DAYS = 60;

export function runCleanup(): void {
  logger.info({ DATA_RETENTION_DAYS }, '[cleanup] Starting data TTL cleanup');

  const tasks: Array<{ label: string; sql: string; days: number }> = [
    {
      label: 'perf_metrics',
      sql: `DELETE FROM perf_metrics WHERE recorded_at < datetime('now', '-' || ? || ' days')`,
      days: DATA_RETENTION_DAYS,
    },
    {
      label: 'update_events',
      sql: `DELETE FROM update_events WHERE recorded_at < datetime('now', '-' || ? || ' days')`,
      days: DATA_RETENTION_DAYS,
    },
    {
      label: 'alert_history',
      sql: `DELETE FROM alert_history WHERE fired_at < datetime('now', '-' || ? || ' days')`,
      days: ALERT_HISTORY_RETENTION_DAYS,
    },
    {
      label: 'error_events',
      sql: `DELETE FROM error_events WHERE recorded_at < datetime('now', '-' || ? || ' days')`,
      days: ERROR_EVENTS_RETENTION_DAYS,
    },
  ];

  for (const task of tasks) {
    try {
      const result = db.prepare(task.sql).run(task.days);
      logger.info(
        { table: task.label, deleted: result.changes, retentionDays: task.days },
        '[cleanup] Pruned old rows',
      );
    } catch (err) {
      logger.warn({ err, table: task.label }, '[cleanup] Failed to prune table');
    }
  }

  logger.info('[cleanup] Data TTL cleanup complete');
}
