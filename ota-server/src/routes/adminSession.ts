import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';

const router = Router();

// Active sessions: token -> expiry timestamp
const sessions = new Map<string, number>();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// Purge expired sessions every 30 minutes to prevent unbounded Map growth
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of sessions) {
    if (now > expiry) sessions.delete(token);
  }
}, 30 * 60_000).unref();

export function isValidAdminSession(req: Request): boolean {
  const token = req.cookies?.admin_session as string | undefined;
  if (!token) return false;
  const expiry = sessions.get(token);
  return expiry !== undefined && Date.now() <= expiry;
}

export function requireAdminSession(req: Request, res: Response, next: NextFunction): void {
  if (!isValidAdminSession(req)) {
    res.redirect('/admin/login.html');
    return;
  }
  next();
}

const loginSchema = z.object({ password: z.string().min(1) });

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: SESSION_TTL_MS,
  secure: process.env.NODE_ENV === 'production',
};

// POST /admin/session/login
router.post('/login', (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  const password = parsed.success ? parsed.data.password : undefined;
  const apiKey = process.env.OTA_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      // Block access when auth is unconfigured in production
      res.status(503).json({ success: false, error: 'Admin auth not configured' });
      return;
    }
    // Dev mode — no auth configured, grant access
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    res.cookie('admin_session', token, cookieOptions);
    res.json({ success: true });
    return;
  }

  if (!password) {
    res.status(401).json({ success: false, error: 'Invalid password' });
    return;
  }

  // Constant-time comparison prevents timing attacks
  const apiKeyBuf = Buffer.from(apiKey);
  const passwordBuf = Buffer.from(password);
  // Compare a same-length dummy buffer when lengths differ to avoid early-exit timing oracle
  const dummyBuf = Buffer.alloc(apiKeyBuf.length);
  const compareBuf = passwordBuf.length === apiKeyBuf.length ? passwordBuf : dummyBuf;
  if (!crypto.timingSafeEqual(compareBuf, apiKeyBuf)) {
    res.status(401).json({ success: false, error: 'Invalid password' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  res.cookie('admin_session', token, cookieOptions);
  res.json({ success: true });
});

// POST /admin/session/logout
router.post('/logout', (req: Request, res: Response) => {
  const token = req.cookies?.admin_session as string | undefined;
  if (token) sessions.delete(token);
  res.clearCookie('admin_session');
  res.json({ success: true });
});

export default router;
