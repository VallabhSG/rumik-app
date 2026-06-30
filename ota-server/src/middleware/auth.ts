import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { isValidAdminSession } from '../routes/adminSession.js';

/**
 * Constant-time comparison of an untrusted input against a secret.
 * Avoids leaking the secret's length/content via response timing — mirrors the
 * pattern already used for admin login in adminSession.ts.
 */
export function safeCompare(input: string, secret: string): boolean {
  const secretBuf = Buffer.from(secret);
  const inputBuf = Buffer.from(input);
  // timingSafeEqual requires equal-length buffers; compare a same-length dummy
  // when lengths differ to avoid an early-exit timing oracle.
  const dummy = Buffer.alloc(secretBuf.length);
  const cmp = inputBuf.length === secretBuf.length ? inputBuf : dummy;
  return crypto.timingSafeEqual(cmp, secretBuf);
}

export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env.OTA_API_KEY;
  if (!apiKey) {
    // Auth disabled — development mode
    next();
    return;
  }

  // Admin dashboard: valid session cookie is sufficient — avoids exposing OTA_API_KEY to browser
  if (isValidAdminSession(req)) {
    next();
    return;
  }

  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token || !safeCompare(token, apiKey)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  next();
}
