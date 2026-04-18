import { djb2 } from '../utils/hash.js';
import { isVersionInRange } from '../utils/semver.js';

export interface TargetingRule {
  platforms?: ('ios' | 'android' | 'web')[];
  min_version?: string;
  max_version?: string;
  percentage?: number;  // 0-100
}

export interface DeviceContext {
  platform: 'ios' | 'android' | 'web';
  nativeVersion: string;
  installId: string;
  /** Key of the entity being evaluated — used as DJB2 seed to ensure independent buckets */
  entityKey: string;
}

/**
 * Evaluate whether a device matches a targeting rule.
 *
 * Rules use AND semantics: every specified criterion must pass.
 * A null/undefined rule means "target everyone" → returns true.
 *
 * Percentage bucketing: djb2(installId + entityKey) % 100 < percentage
 * This is stable per device per entity — a device stays in or out of a
 * percentage rollout as long as installId and entityKey don't change.
 */
export function evaluateTargeting(
  rule: TargetingRule | null | undefined,
  context: DeviceContext,
): boolean {
  if (!rule) return true;

  if (rule.platforms && rule.platforms.length > 0) {
    if (!rule.platforms.includes(context.platform)) return false;
  }

  if (rule.min_version || rule.max_version) {
    if (
      !isVersionInRange(
        context.nativeVersion,
        rule.min_version ?? null,
        rule.max_version ?? null,
      )
    ) {
      return false;
    }
  }

  if (rule.percentage !== undefined && rule.percentage < 100) {
    if (rule.percentage <= 0) return false;
    const bucket = djb2(context.installId + context.entityKey) % 100;
    if (bucket >= rule.percentage) return false;
  }

  return true;
}

/**
 * Parse a targeting JSON string from the DB, returning null on failure.
 */
export function parseTargeting(raw: string | null): TargetingRule | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TargetingRule;
  } catch {
    return null;
  }
}
