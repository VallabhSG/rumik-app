import db from './db.js';
import { v4 as uuid } from 'uuid';
import logger from './logger.js';

/**
 * Rollout stage progression: percentage → minimum hours before advancing.
 * Matches DEFAULT_ROLLOUT_STAGES on the client.
 */
const STAGES: Array<{ percentage: number; minHoursAtStage: number }> = [
  { percentage: 5,   minHoursAtStage: 1  },
  { percentage: 25,  minHoursAtStage: 4  },
  { percentage: 50,  minHoursAtStage: 12 },
  { percentage: 100, minHoursAtStage: 0  },
];

const CRASH_THRESHOLD = Number(process.env.OTA_CRASH_THRESHOLD ?? 0.05); // 5%
const INTERVAL_MS     = Number(process.env.ROLLOUT_SCHEDULER_INTERVAL_MS ?? 30 * 60 * 1000); // 30 min

// ── Helpers ──────────────────────────────────────────────────────────────────

function nextStage(currentPct: number): { percentage: number; minHoursAtStage: number } | null {
  // Use > rather than exact equality so releases manually set to a
  // non-standard percentage (e.g. 10%) are not silently skipped forever.
  return STAGES.find(s => s.percentage > currentPct) ?? null;
}

function hoursElapsed(since: string): number {
  return (Date.now() - new Date(since).getTime()) / 3_600_000;
}

function latestCrashRate(version: string, channel: string): number {
  const row = db.prepare(`
    SELECT crash_rate FROM crash_rates
    WHERE version = ? AND (channel = ? OR channel IS NULL)
    ORDER BY recorded_at DESC LIMIT 1
  `).get(version, channel) as { crash_rate: number } | undefined;
  return row?.crash_rate ?? 0;
}

function recordRollback(releaseId: string, version: string, channel: string, reason: string): void {
  const now = new Date().toISOString();

  // Look up the most recent previously-active release in the same channel to
  // determine what version clients will fall back to. This is the release
  // that was active before the current one, i.e. not the paused release itself.
  const previous = db.prepare(`
    SELECT version FROM releases
    WHERE channel = ? AND status = 'active' AND version != ?
    ORDER BY created_at DESC LIMIT 1
  `).get(channel, version) as { version: string } | undefined;

  db.prepare(`
    INSERT INTO rollbacks (id, target_version, from_version, reason, channels, triggered_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'scheduler', 'completed', ?)
  `).run(uuid(), previous?.version ?? 'unknown', version, reason, channel, now);
}

// ── Flag schedule execution ───────────────────────────────────────────────────

interface PendingSchedule {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  payload: string | null;
  scheduled_at: string;
}

function processSchedules(): void {
  const pending = db.prepare(`
    SELECT id, entity_type, entity_id, action, payload, scheduled_at
    FROM flag_schedules
    WHERE scheduled_at <= datetime('now') AND executed_at IS NULL
  `).all() as PendingSchedule[];

  if (pending.length === 0) return;

  for (const schedule of pending) {
    const { id, entity_type, action, entity_id, payload: rawPayload } = schedule;

    try {
      if (entity_type === 'flag') {
        if (action === 'activate') {
          db.prepare('UPDATE feature_flags SET enabled = 1 WHERE id = ?').run(entity_id);
        } else if (action === 'deactivate') {
          db.prepare('UPDATE feature_flags SET enabled = 0 WHERE id = ?').run(entity_id);
        } else if (action === 'update_targeting') {
          const payload = rawPayload ? JSON.parse(rawPayload) : {};
          const targeting = JSON.stringify(payload.targeting ?? {});
          db.prepare('UPDATE feature_flags SET targeting = ? WHERE id = ?').run(targeting, entity_id);
        }
      } else if (entity_type === 'experiment') {
        if (action === 'activate') {
          db.prepare("UPDATE experiments SET status = 'active' WHERE id = ?").run(entity_id);
        } else if (action === 'complete') {
          db.prepare("UPDATE experiments SET status = 'completed' WHERE id = ?").run(entity_id);
        }
      } else if (entity_type === 'kill_switch') {
        if (action === 'activate') {
          db.prepare('UPDATE kill_switches SET active = 1 WHERE id = ?').run(entity_id);
        } else if (action === 'deactivate') {
          db.prepare('UPDATE kill_switches SET active = 0 WHERE id = ?').run(entity_id);
        }
      }

      db.prepare("UPDATE flag_schedules SET executed_at = datetime('now') WHERE id = ?").run(id);
      logger.info({ scheduleId: id, entity_type, action }, 'scheduler: executed schedule');
    } catch (err) {
      logger.error({ err, scheduleId: id, entity_type, action }, 'scheduler: failed to execute schedule');
    }
  }
}

// ── Main tick ─────────────────────────────────────────────────────────────────

interface ActiveRelease {
  id: string;
  version: string;
  channel: string;
  rollout_percentage: number;
  rollout_advanced_at: string | null;
  created_at: string;
}

function tick(): void {
  processSchedules();

  const releases = db.prepare(`
    SELECT id, version, channel, rollout_percentage, rollout_advanced_at, created_at
    FROM releases
    WHERE status = 'active' AND rollout_percentage < 100
    ORDER BY created_at ASC
  `).all() as ActiveRelease[];

  if (releases.length === 0) return;

  const now = new Date().toISOString();

  for (const release of releases) {
    const next = nextStage(release.rollout_percentage);
    if (!next) continue; // already at a stage we don't know — skip

    // ── Crash-rate guard ─────────────────────────────────────────────────────
    const crashRate = latestCrashRate(release.version, release.channel);
    if (crashRate > CRASH_THRESHOLD) {
      logger.warn(
        { version: release.version, channel: release.channel, crashRate, threshold: CRASH_THRESHOLD },
        'scheduler pausing release — crash rate exceeded threshold',
      );
      db.prepare(`UPDATE releases SET status = 'paused', updated_at = ? WHERE id = ?`)
        .run(now, release.id);
      recordRollback(
        release.id,
        release.version,
        release.channel,
        `Auto-paused by scheduler: crash rate ${(crashRate * 100).toFixed(1)}%`,
      );
      continue;
    }

    // ── Time gate ────────────────────────────────────────────────────────────
    const currentStage = STAGES.find(s => s.percentage === release.rollout_percentage);
    const minHours = currentStage?.minHoursAtStage ?? 1;
    const since = release.rollout_advanced_at ?? release.created_at;
    const elapsed = hoursElapsed(since);

    if (elapsed < minHours) {
      logger.debug(
        { version: release.version, channel: release.channel, rolloutPct: release.rollout_percentage, elapsed, minHours },
        'scheduler: release not ready to advance',
      );
      continue;
    }

    // ── Advance ──────────────────────────────────────────────────────────────
    logger.info(
      { version: release.version, channel: release.channel, fromPct: release.rollout_percentage, toPct: next.percentage, elapsed },
      'scheduler advancing rollout',
    );
    db.prepare(`
      UPDATE releases
      SET rollout_percentage = ?, rollout_advanced_at = ?, updated_at = ?
      WHERE id = ?
    `).run(next.percentage, now, now, release.id);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SchedulerStatus {
  running: boolean;
  intervalMinutes: number;
  crashThreshold: number;
  stages: typeof STAGES;
  pendingReleases: Array<{
    id: string;
    version: string;
    channel: string;
    currentPct: number;
    nextPct: number | null;
    hoursElapsed: number;
    hoursRequired: number;
    readyToAdvance: boolean;
    crashRate: number;
  }>;
}

export function getSchedulerStatus(): SchedulerStatus {
  const releases = db.prepare(`
    SELECT id, version, channel, rollout_percentage, rollout_advanced_at, created_at
    FROM releases
    WHERE status = 'active' AND rollout_percentage < 100
  `).all() as ActiveRelease[];

  return {
    running: true,
    intervalMinutes: INTERVAL_MS / 60_000,
    crashThreshold: CRASH_THRESHOLD,
    stages: STAGES,
    pendingReleases: releases.map(r => {
      const next = nextStage(r.rollout_percentage);
      const stage = STAGES.find(s => s.percentage === r.rollout_percentage);
      const minHours = stage?.minHoursAtStage ?? 1;
      const elapsed = hoursElapsed(r.rollout_advanced_at ?? r.created_at);
      const crashRate = latestCrashRate(r.version, r.channel);
      return {
        id: r.id,
        version: r.version,
        channel: r.channel,
        currentPct: r.rollout_percentage,
        nextPct: next?.percentage ?? null,
        hoursElapsed: Math.round(elapsed * 10) / 10,
        hoursRequired: minHours,
        readyToAdvance: elapsed >= minHours && crashRate <= CRASH_THRESHOLD,
        crashRate,
      };
    }),
  };
}

export function startRolloutScheduler(): void {
  logger.info(
    { intervalMins: INTERVAL_MS / 60_000, crashThresholdPct: CRASH_THRESHOLD * 100, stages: STAGES.map(s => `${s.percentage}%`).join('→') },
    'rollout scheduler started',
  );
  tick();
  setInterval(tick, INTERVAL_MS);
}
