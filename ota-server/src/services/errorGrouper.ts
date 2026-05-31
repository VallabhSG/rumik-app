import { createHash } from 'crypto';
import { v4 as uuid } from 'uuid';
import db from '../db.js';

const PII_PATTERNS: RegExp[] = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
];

function scrubPII(text: string): string {
  let result = text;
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
    pattern.lastIndex = 0;
  }
  return result;
}

function scrubFrame(frame: StackFrame): StackFrame {
  return {
    ...frame,
    file: scrubPII(frame.file),
    func: frame.func ? scrubPII(frame.func) : frame.func,
  };
}

interface StackFrame {
  file: string;
  line?: number;
  column?: number;
  func?: string;
}

interface ErrorPayload {
  device_id: string;
  version: string;
  channel: string;
  platform: string;
  error_type: string;
  message: string;
  stack_trace: StackFrame[];
  context?: Record<string, unknown>;
}

interface ErrorGroup {
  id: string;
  fingerprint: string;
  event_count: number;
  device_count: number;
}

function computeFingerprint(errorType: string, stackTrace: StackFrame[]): string {
  const top = stackTrace.slice(0, 3).map(f => `${f.file}::${f.func ?? '?'}`).join('|');
  return createHash('sha256').update(`${errorType}::${top}`).digest('hex').slice(0, 16);
}

export function groupError(rawPayload: ErrorPayload): { group_id: string; is_new: boolean } {
  const payload: ErrorPayload = {
    ...rawPayload,
    message: scrubPII(rawPayload.message),
    stack_trace: rawPayload.stack_trace.map(scrubFrame),
  };
  const fingerprint = computeFingerprint(payload.error_type, payload.stack_trace);
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT * FROM error_groups WHERE fingerprint = ?').get(fingerprint) as ErrorGroup | undefined;

  let group_id: string;
  let is_new: boolean;

  if (existing) {
    group_id = existing.id;
    is_new = false;

    // Check if this device is new to the group
    const deviceSeen = db.prepare(
      'SELECT 1 FROM error_events WHERE group_id = ? AND device_id = ? LIMIT 1',
    ).get(existing.id, payload.device_id);

    db.prepare(`
      UPDATE error_groups
      SET event_count = event_count + 1,
          device_count = device_count + ?,
          last_seen = ?,
          updated_at = ?
      WHERE id = ?
    `).run(deviceSeen ? 0 : 1, now, now, existing.id);
  } else {
    group_id = uuid();
    is_new = true;

    const title = `${payload.error_type}: ${payload.message}`.slice(0, 200);
    db.prepare(`
      INSERT INTO error_groups
        (id, fingerprint, title, error_type, first_seen, last_seen, event_count, device_count, version, channel, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, 'open', ?)
    `).run(group_id, fingerprint, title, payload.error_type, now, now, payload.version, payload.channel, now);
  }

  // Always insert the individual event
  db.prepare(`
    INSERT INTO error_events
      (id, group_id, device_id, version, platform, error_type, message, stack_trace, context, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid(), group_id, payload.device_id, payload.version, payload.platform,
    payload.error_type, payload.message,
    JSON.stringify(payload.stack_trace),
    payload.context ? JSON.stringify(payload.context) : null,
    now,
  );

  return { group_id, is_new };
}
