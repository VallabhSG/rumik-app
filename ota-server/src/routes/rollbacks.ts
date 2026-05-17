import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { logChange, diffObjects } from '../services/audit.js';
import logger from '../logger.js';

const router = Router();

const CreateRollbackSchema = z.object({
  target_version: z.string().min(1),
  reason: z.string().min(1),
  channels: z.string().default('production'),
  triggered_by: z.string().default('system'),
});

// GET /api/rollbacks
router.get('/', (_req: Request, res: Response) => {
  const rollbacks = db.prepare('SELECT * FROM rollbacks ORDER BY created_at DESC').all();
  res.json({ success: true, data: rollbacks });
});

// POST /api/rollbacks
router.post('/', (req: Request, res: Response) => {
  const parsed = CreateRollbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { target_version, reason, channels, triggered_by } = parsed.data;
  const now = new Date().toISOString();
  const id = uuid();

  // Guard: ignore rollbacks triggered by Expo Go / SDK dev runtime versions.
  // exposdk:* is never a real production release — Expo Go hot-reloads create
  // false crashes because the JS process restarts without a graceful background
  // transition, so the session-open watchdog fires on every reload.
  const isDevRuntime = reason.includes('exposdk:') || target_version === 'unknown';

  // Find what version is currently active (to record from_version)
  const channelList = channels.split(',').map(c => c.trim());
  const from_release = db.prepare(`
    SELECT version FROM releases
    WHERE channel = ? AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  `).get(channelList[0] ?? 'production') as { version: string } | undefined;

  if (!isDevRuntime) {
    // Deactivate current active releases across all specified channels
    const deactivate = db.prepare(`
      UPDATE releases SET status = 'rolled_back', updated_at = ?
      WHERE channel = ? AND status = 'active'
    `);

    // Reactivate the target version across all channels
    const reactivate = db.prepare(`
      UPDATE releases SET status = 'active', updated_at = ?
      WHERE version = ? AND channel = ?
    `);

    db.transaction(() => {
      for (const channel of channelList) {
        deactivate.run(now, channel);
        reactivate.run(now, target_version, channel);
      }
    })();
  }

  db.prepare(`
    INSERT INTO rollbacks (id, target_version, from_version, reason, channels, triggered_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)
  `).run(id, target_version, from_release?.version ?? null, reason, channels, triggered_by, now);

  const responseData = {
    id,
    target_version,
    from_version: from_release?.version ?? null,
    reason,
    channels,
    triggered_by,
    status: 'completed',
    created_at: now,
  };
  try {
    logChange('rollback', id, 'created', diffObjects(null, responseData as Record<string, unknown>));
  } catch (e) {
    logger.warn({ err: e }, 'Audit log write failed');
  }
  res.status(201).json({ success: true, data: responseData });
});

export default router;
