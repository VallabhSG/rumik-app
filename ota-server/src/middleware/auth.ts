import { Request, Response, NextFunction } from 'express';
import { isValidAdminSession } from '../routes/adminSession.js';

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

  if (token !== apiKey) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  next();
}
