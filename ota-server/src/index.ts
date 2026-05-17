import './tracing.js';
import http from 'http';
import path from 'path';
import express from 'express';
import logger from './logger.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { bearerAuth } from './middleware/auth.js';
import adminSessionRouter, { requireAdminSession } from './routes/adminSession.js';
import releasesRouter from './routes/releases.js';
import rollbacksRouter from './routes/rollbacks.js';
import metricsRouter from './routes/metrics.js';
import flagsRouter from './routes/flags.js';
import experimentsRouter from './routes/experiments.js';
import urlsRouter from './routes/urls.js';
import killSwitchesRouter, { setBroadcast } from './routes/killSwitches.js';
import auditLogRouter from './routes/auditLog.js';
import configRouter from './routes/config.js';
import perfMetricsRouter from './routes/perfMetrics.js';
import updateEventsRouter from './routes/updateEvents.js';
import alertsRouter from './routes/alerts.js';
import errorsRouter from './routes/errors.js';
import { attachWsServer, setupRedisPubSub } from './ws.js';
import { startRolloutScheduler, getSchedulerStatus } from './rolloutScheduler.js';
import { getRedis } from './redis.js';
import { RedisStore } from 'rate-limit-redis';
import { runAlertEngine } from './services/alertEngine.js';
import { runCleanup } from './services/cleanup.js';
import { runMigrations } from './migrate.js';
import prometheusMetricsRouter from './routes/prometheusMetrics.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(cookieParser());

// Build rate limiter — use Redis store when available, memory otherwise
function buildRateLimiter() {
  const redis = getRedis();
  const store = redis
    ? new RedisStore({ sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<number> })
    : undefined;

  return rateLimit({
    windowMs: 60 * 1000,        // 1 minute window
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    standardHeaders: true,
    legacyHeaders: false,
    store,
    message: { success: false, error: 'Too many requests, please try again later.' },
  });
}

const apiLimiter = buildRateLimiter();

// Health check — no auth
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Prometheus metrics — no auth (scraper access)
app.use('/metrics', prometheusMetricsRouter);

// All /api routes: rate limit first, then bearer auth
app.use('/api', apiLimiter);
app.use('/api', bearerAuth);
app.use('/api/releases', releasesRouter);
app.use('/api/rollbacks', rollbacksRouter);
app.use('/api/crash-rate', metricsRouter);
app.use('/api/flags', flagsRouter);
app.use('/api/experiments', experimentsRouter);
app.use('/api/urls', urlsRouter);
app.use('/api/kill-switches', killSwitchesRouter);
app.use('/api/audit', auditLogRouter);
app.use('/api/config', configRouter);
app.use('/api/perf-metrics', perfMetricsRouter);
app.use('/api/update-events', updateEventsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/errors', errorsRouter);

// Rollout scheduler status
app.get('/api/scheduler', (_req, res) => {
  res.json({ success: true, data: getSchedulerStatus() });
});

// Admin session routes (no auth required — handles login/logout)
app.use('/admin/session', express.json(), adminSessionRouter);

// Login page and its CSS asset (no auth required)
app.use('/admin/login.html', express.static(path.join(__dirname, '../public/admin/login.html')));
app.use('/admin/style.css', express.static(path.join(__dirname, '../public/admin/style.css')));

// Protected admin dashboard — requires valid session cookie
app.use('/admin', requireAdminSession, express.static(path.join(__dirname, '../public/admin')));

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

const httpServer = http.createServer(app);

// WebSocket server — attach to same HTTP server on path /ws
const broadcastFn = attachWsServer(httpServer);
setBroadcast(broadcastFn);
setupRedisPubSub(broadcastFn);

httpServer.listen(PORT, () => {
  const authMode = process.env.OTA_API_KEY ? 'bearer auth enabled' : 'auth disabled (dev)';
  logger.info({ port: PORT, authMode }, 'OTA server listening');
  logger.info({ url: `ws://localhost:${PORT}/ws` }, 'WebSocket server ready');
  runMigrations().catch(e => logger.error({ err: e }, 'Migration failed'));
  startRolloutScheduler();
  // Alert engine: evaluate rules every 5 minutes
  setInterval(() => { runAlertEngine().catch(e => logger.error({ err: e }, 'alertEngine error')); }, 5 * 60_000);
  // Data TTL cleanup: run at startup (after 5s) then daily
  setTimeout(() => { try { runCleanup(); } catch (e) { logger.warn({ err: e }, 'cleanup startup error'); } }, 5_000);
  setInterval(() => { try { runCleanup(); } catch (e) { logger.warn({ err: e }, 'cleanup error'); } }, 24 * 60 * 60_000);
});

export { app };
export default httpServer;
