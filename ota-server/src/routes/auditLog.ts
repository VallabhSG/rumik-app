import { Router } from 'express';
import db from '../db.js';
import type { AuditEntry } from '../services/audit.js';

const router = Router();

interface AuditRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: string | null;
  actor: string;
  created_at: string;
}

function parseAuditEntry(row: AuditRow): AuditEntry {
  return {
    ...row,
    entity_type: row.entity_type as AuditEntry['entity_type'],
    action: row.action as AuditEntry['action'],
    changes: row.changes ? JSON.parse(row.changes) : null,
  };
}

// GET /api/audit
// Query params: entity_type, entity_id, limit (default 50), offset (default 0)
router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);
  const { entity_type, entity_id } = req.query;

  let sql = 'SELECT * FROM audit_log';
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (entity_type) { conditions.push('entity_type = ?'); params.push(entity_type); }
  if (entity_id) { conditions.push('entity_id = ?'); params.push(entity_id); }
  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params) as AuditRow[];
  const total = (db.prepare(
    `SELECT COUNT(*) as count FROM audit_log${conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''}`
  ).get(...params.slice(0, -2)) as { count: number }).count;

  res.json({
    success: true,
    data: rows.map(parseAuditEntry),
    meta: { total, limit, offset },
  });
});

export default router;
