import { Request, Response, NextFunction } from 'express';

export function actorMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.locals.actor = (req.headers['x-actor'] as string | undefined) ?? 'api';
  next();
}
