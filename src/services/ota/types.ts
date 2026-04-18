export interface OtaRelease {
  id: string;
  version: string;
  channel: string;
  platform: string;
  rollout_percentage: number;
  is_rollback: boolean;
  status: string;
  commit_sha: string | null;
  min_native_version: string | null;
  max_native_version: string | null;
  release_notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface LaunchRecord {
  version: string;
  launchCount: number;
  crashCount: number;
  lastCrashAt: string | null;
}

export interface OtaConfig {
  serverUrl: string;
  apiKey: string;
  channel: string;
  platform: 'ios' | 'android';
  nativeVersion: string;
  /**
   * Fraction 0.0–1.0. Crash rate above this triggers auto-rollback.
   * Default: 0.5 (50%)
   */
  crashThreshold: number;
  /**
   * Minimum launches on a version before crash rate is evaluated.
   * Prevents premature rollback on first-launch edge cases. Default: 3
   */
  minLaunchesBeforeRollback: number;
}

/** Rollout stages: each entry is a { percentage, minHoursAtStage } pair */
export interface RolloutStage {
  percentage: number;
  /** Minimum hours to hold at this percentage before advancing */
  minHoursAtStage: number;
}

export const DEFAULT_ROLLOUT_STAGES: RolloutStage[] = [
  { percentage: 5,   minHoursAtStage: 1  },
  { percentage: 25,  minHoursAtStage: 4  },
  { percentage: 50,  minHoursAtStage: 12 },
  { percentage: 100, minHoursAtStage: 0  },
];

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'not-in-rollout'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';
