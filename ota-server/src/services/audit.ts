import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

export type EntityType = 'flag' | 'experiment' | 'url' | 'kill_switch' | 'release' | 'alert_rule' | 'rollback';
export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'activated'
  | 'deactivated'
  | 'paused'
  | 'rolled_back'
  | 'assignments_cleared'
  | 'promoted';

export interface AuditEntry {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  action: AuditAction;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  actor: string;
  created_at: string;
}

const insert = db.prepare<[string, string, string, string, string | null, string, string]>(`
  INSERT INTO audit_log (id, entity_type, entity_id, action, changes, actor, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

/**
 * Write one audit log entry. Synchronous — SQLite is fast enough for this.
 * Never throws; logs to console on DB error so calling routes don't break.
 */
export function logChange(
  entityType: EntityType,
  entityId: string,
  action: AuditAction,
  changes: Record<string, { old: unknown; new: unknown }> | null,
  actor = 'api',
): void {
  try {
    insert.run(
      uuidv4(),
      entityType,
      entityId,
      action,
      changes ? JSON.stringify(changes) : null,
      actor,
      new Date().toISOString(),
    );
  } catch (err) {
    console.error('[audit] failed to write log entry:', err);
  }
}

/**
 * Build a changes diff from two plain objects, emitting only keys that changed.
 * Pass `null` as `before` for creates (all keys are "new").
 */
export function diffObjects(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after),
  ]);
  for (const key of keys) {
    const oldVal = before?.[key] ?? null;
    const newVal = after[key] ?? null;
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { old: oldVal, new: newVal };
    }
  }
  return diff;
}
