import type Database from 'better-sqlite3';
import { djb2 } from '../utils/hash.js';
import { isVersionInRange } from '../utils/semver.js';

export interface AttributeRule {
  attribute: 'plan' | 'email_domain' | 'account_age_days';
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'in';
  value: string | number | string[];
}

export interface TargetingRule {
  platforms?: ('ios' | 'android' | 'web')[];
  min_version?: string;
  max_version?: string;
  percentage?: number; // 0-100
  user_ids?: string[];
  segment_keys?: string[];
  user_attribute_rules?: AttributeRule[];
}

export interface DeviceContext {
  platform: 'ios' | 'android' | 'web';
  nativeVersion: string;
  installId: string;
  /** Key of the entity being evaluated — used as DJB2 seed to ensure independent buckets */
  entityKey: string;
}

export interface UserContext {
  userId?: string;
  plan?: string;
  email_domain?: string;
  account_age_days?: number;
}

/**
 * Evaluate a single AttributeRule against a UserContext.
 * Returns false when the attribute is absent.
 */
export function evaluateAttributeRule(rule: AttributeRule, user: UserContext): boolean {
  const val = user[rule.attribute as keyof UserContext];
  if (val === undefined || val === null) return false;
  switch (rule.operator) {
    case 'eq':
      return String(val) === String(rule.value);
    case 'neq':
      return String(val) !== String(rule.value);
    case 'gt':
      return Number(val) > Number(rule.value);
    case 'lt':
      return Number(val) < Number(rule.value);
    case 'contains':
      return String(val).includes(String(rule.value));
    case 'in':
      return Array.isArray(rule.value) && (rule.value as string[]).includes(String(val));
    default:
      return false;
  }
}

/**
 * Evaluate whether a device (and optional user) matches a targeting rule.
 *
 * Rules use AND semantics: every specified criterion must pass.
 * A null/undefined rule means "target everyone" → returns true.
 *
 * Percentage bucketing: djb2(installId + entityKey) % 100 < percentage
 * This is stable per device per entity — a device stays in or out of a
 * percentage rollout as long as installId and entityKey don't change.
 *
 * user_ids: OR within the list — user must be in the list.
 * segment_keys: OR between segments — user must match at least one segment's rules (AND within).
 * user_attribute_rules: AND all — user must match every rule.
 */
export function evaluateTargeting(
  rule: TargetingRule | null | undefined,
  context: DeviceContext,
  userCtx?: UserContext,
  db?: Database.Database,
): boolean {
  if (!rule) return true;

  // 1. platforms
  if (rule.platforms && rule.platforms.length > 0) {
    if (!rule.platforms.includes(context.platform)) return false;
  }

  // 2. version range
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

  // 3. percentage bucket (stable per install+entity)
  if (rule.percentage !== undefined && rule.percentage < 100) {
    if (rule.percentage <= 0) return false;
    const bucket = djb2(context.installId + context.entityKey) % 100;
    if (bucket >= rule.percentage) return false;
  }

  // 4. user_ids — OR within list
  if (rule.user_ids && rule.user_ids.length > 0) {
    if (!userCtx?.userId || !rule.user_ids.includes(userCtx.userId)) return false;
  }

  // 5. segment_keys — OR between segments; each segment ANDs its rules
  if (rule.segment_keys && rule.segment_keys.length > 0) {
    if (!userCtx || !db) return false;
    const matchesAnySegment = rule.segment_keys.some(key => {
      const seg = db
        .prepare('SELECT rules FROM segments WHERE key = ?')
        .get(key) as { rules: string } | undefined;
      if (!seg) return false;
      try {
        const segRules: AttributeRule[] = JSON.parse(seg.rules) as AttributeRule[];
        return segRules.every(r => evaluateAttributeRule(r, userCtx));
      } catch {
        return false;
      }
    });
    if (!matchesAnySegment) return false;
  }

  // 6. user_attribute_rules — AND all
  if (rule.user_attribute_rules && rule.user_attribute_rules.length > 0) {
    if (!userCtx) return false;
    if (!rule.user_attribute_rules.every(r => evaluateAttributeRule(r, userCtx))) return false;
  }

  return true;
}

/**
 * Parse a targeting JSON string from the DB, returning null on failure.
 */
export function parseTargeting(raw: string | null | undefined): TargetingRule | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TargetingRule;
  } catch {
    return null;
  }
}
