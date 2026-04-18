import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import semver from 'semver';
import db from '../db.js';

const router = Router();

const CreateReleaseSchema = z.object({
  version: z.string().min(1),
  channel: z.string().default('production'),
  platform: z.enum(['ios', 'android', 'web', 'all']).default('all'),
  rollout_percentage: z.number().min(0).max(100).default(0),
  is_rollback: z.boolean().default(false),
  commit_sha: z.string().optional(),
  min_native_version: z.string().optional(),
  max_native_version: z.string().optional(),
  release_notes: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateReleaseSchema = z.object({
  rollout_percentage: z.number().min(0).max(100).optional(),
  status: z.enum(['active', 'paused', 'rolled_back']).optional(),
  release_notes: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  min_native_version: z.string().optional(),
  max_native_version: z.string().optional(),
});

// GET /api/releases
router.get('/', (req: Request, res: Response) => {
  const { channel, platform, status } = req.query;
  let query = 'SELECT * FROM releases WHERE 1=1';
  const params: unknown[] = [];

  if (channel) { query += ' AND channel = ?'; params.push(channel); }
  if (platform) { query += ' AND (platform = ? OR platform = 'all')'; params.push(platform); }
  if (status) { query += ' AND status = ?'; params.push(status); }

  query += ' ORDER BY created_at DESC';
  const releases = db.prepare(query).all(...params);
  res.json({ success: true, data: releases.map(parseRelease) });
});

// GET /api/releases/current
// Optional ?native_version=1.2.0 enforces min/max_native_version constraints
router.get('/current', (req: Request, res: Response) => {
  const { channel = 'production', platform, native_version } = req.query;

  let query = `
    SELECT * FROM releases
    WHERE channel = ? AND status = 'active'
  `;
  const params: unknown[] = [channel];

  if (platform) {
    query += ' AND (platform = ? OR platform = 'all')';
    params.push(platform);
  }
  query += ' ORDER BY rollout_percentage DESC, created_at DESC';

  const candidates = db.prepare(query).all(...params) as Record<string, unknown>[];

  // Filter by native version constraints when caller provides their native build version
  const clientVersion = typeof native_version === 'string' ? semver.valid(semver.coerce(native_version)) : null;

  const release = candidates.find((r) => {
    if (!clientVersion) return true; // no version supplied — skip constraint check

    const min = r.min_native_version ? semver.valid(semver.coerce(r.min_native_version as string)) : null;
    const max = r.max_native_version ? semver.valid(semver.coerce(r.max_native_version as string)) : null;

    if (min && semver.lt(clientVersion, min)) return false;
    if (max && semver.gt(clientVersion, max)) return false;
    return true;
  });

  if (!release) {
    res.status(404).json({ success: false, error: 'No active release found' });
    return;
  }
  res.json({ success: true, data: parseRelease(release) });
});

// GET /api/releases/:id
router.get('/:id', (req: Request, res: Response) => {
  const release = db.prepare('SELECT * FROM releases WHERE id = ?').get(req.params.id);
  if (!release) {
    res.status(404).json({ success: false, error: 'Release not found' });
    return;
  }
  res.json({ success: true, data: parseRelease(release) });
});

// POST /api/releases
router.post('/', (req: Request, res: Response) => {
  const parsed = CreateReleaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  const now = new Date().toISOString();
  const id = uuid();

  db.prepare(`
    INSERT INTO releases
      (id, version, channel, platform, rollout_percentage, is_rollback, status,
       commit_sha, min_native_version, max_native_version, release_notes, metadata,
       created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, data.version, data.channel, data.platform,
    data.rollout_percentage, data.is_rollback ? 1 : 0, 'active',
    data.commit_sha ?? null,
    data.min_native_version ?? null,
    data.max_native_version ?? null,
    data.release_notes ?? null,
    data.metadata ? JSON.stringify(data.metadata) : null,
    now, now,
  );

  const release = db.prepare('SELECT * FROM releases WHERE id = ?').get(id);
  res.status(201).json({ success: true, data: parseRelease(release) });
});

// PATCH /api/releases/:id
router.patch('/:id', (req: Request, res: Response) => {
  const release = db.prepare('SELECT * FROM releases WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!release) {
    res.status(404).json({ success: false, error: 'Release not found' });
    return;
  }

  const parsed = UpdateReleaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const updates = parsed.data;
  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (updates.rollout_percentage !== undefined) { fields.push('rollout_percentage = ?'); params.push(updates.rollout_percentage); }
  if (updates.status !== undefined) { fields.push('status = ?'); params.push(updates.status); }
  if (updates.release_notes !== undefined) { fields.push('release_notes = ?'); params.push(updates.release_notes); }
  if (updates.metadata !== undefined) { fields.push('metadata = ?'); params.push(JSON.stringify(updates.metadata)); }
  if (updates.min_native_version !== undefined) { fields.push('min_native_version = ?'); params.push(updates.min_native_version); }
  if (updates.max_native_version !== undefined) { fields.push('max_native_version = ?'); params.push(updates.max_native_version); }

  params.push(req.params.id);
  db.prepare(`UPDATE releases SET ${fields.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM releases WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: parseRelease(updated) });
});

// POST /api/releases/current/pause
router.post('/current/pause', (req: Request, res: Response) => {
  const { channel = 'production', reason } = req.body as { channel?: string; reason?: string };
  const now = new Date().toISOString();

  const result = db.prepare(`
    UPDATE releases SET status = 'paused', updated_at = ?
    WHERE channel = ? AND status = 'active'
  `).run(now, channel);

  res.json({
    success: true,
    data: { paused_count: result.changes, channel, reason: reason ?? 'manual' },
  });
});

// DELETE /api/releases/:id  (soft delete → rolled_back)
router.delete('/:id', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE releases SET status = 'rolled_back', updated_at = ? WHERE id = ?
  `).run(now, req.params.id);

  if (result.changes === 0) {
    res.status(404).json({ success: false, error: 'Release not found' });
    return;
  }
  res.json({ success: true, data: { id: req.params.id, status: 'rolled_back' } });
});

function parseRelease(row: unknown): unknown {
  const r = row as Record<string, unknown>;
  return {
    ...r,
    is_rollback: r.is_rollback === 1,
    metadata: r.metadata ? JSON.parse(r.metadata as string) : null,
  };
}

export default router;
