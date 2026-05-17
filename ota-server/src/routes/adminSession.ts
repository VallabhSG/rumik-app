import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const router = Router();

// Active sessions: token -> expiry timestamp
const sessions = new Map<string, number>();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export function requireAdminSession(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.admin_session as string | undefined;
  const expiry = token ? sessions.get(token) : undefined;
  if (!expiry || Date.now() > expiry) {
    res.redirect('/admin/login.html');
    return;
  }
  next();
}

// POST /admin/session/login
router.post('/login', (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  const apiKey = process.env.OTA_API_KEY;

  if (!apiKey) {
    // Dev mode — no auth configured, grant access
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    res.cookie('admin_session', token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_TTL_MS });
    res.json({ success: true });
    return;
  }

  if (!password || password !== apiKey) {
    res.status(401).json({ success: false, error: 'Invalid password' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  res.cookie('admin_session', token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_TTL_MS });
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
