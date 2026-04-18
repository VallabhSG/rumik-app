import db from './db.js';
import { v4 as uuid } from 'uuid';

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
  const idx = STAGES.findIndex(s => s.percentage === currentPct);
  if (idx === -1 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
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
  db.prepare(`
    INSERT INTO rollbacks (id, target_version, from_version, reason, channels, triggered_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'scheduler', 'completed', ?)
  `).run(uuid(), version, version, reason, channel, now);
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
      console.warn(
        `[scheduler] PAUSING ${release.version} (${release.channel}) — ` +
        `crash rate ${(crashRate * 100).toFixed(1)}% > ${(CRASH_THRESHOLD * 100).toFixed(0)}% threshold`
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
      console.log(
        `[scheduler] ${release.version} (${release.channel}) at ${release.rollout_percentage}% — ` +
        `${elapsed.toFixed(1)}h / ${minHours}h elapsed, not ready`
      );
      continue;
    }

    // ── Advance ──────────────────────────────────────────────────────────────
    console.log(
      `[scheduler] ADVANCING ${release.version} (${release.channel}) ` +
      `${release.rollout_percentage}% → ${next.percentage}% ` +
      `(${elapsed.toFixed(1)}h elapsed)`
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
  console.log(
    `[scheduler] Started — interval: ${INTERVAL_MS / 60_000}min, ` +
    `crash threshold: ${(CRASH_THRESHOLD * 100).toFixed(0)}%, ` +
    `stages: ${STAGES.map(s => `${s.percentage}%`).join('→')}`
  );
  tick();
  setInterval(tick, INTERVAL_MS);
}
