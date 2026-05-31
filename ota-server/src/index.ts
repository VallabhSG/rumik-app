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
import segmentsRouter from './routes/segments.js';
import schedulesRouter from './routes/schedules.js';
import { attachWsServer, setupRedisPubSub } from './ws.js';
import { startRolloutScheduler, getSchedulerStatus } from './rolloutScheduler.js';
import { getRedis } from './redis.js';
import { RedisStore } from 'rate-limit-redis';
import { runAlertEngine } from './services/alertEngine.js';
import { runCleanup } from './services/cleanup.js';
import { runMigrations } from './migrate.js';
import prometheusMetricsRouter from './routes/prometheusMetrics.js';
import { actorMiddleware } from './middleware/actor.js';
import db from './db.js';

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

// Actor middleware — applied globally so all routes know who made the request
app.use(actorMiddleware);

// Health check — no auth
app.get('/health', (_req, res) => {
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    db.prepare('SELECT 1').get();
  } catch {
    dbStatus = 'error';
  }
  const mem = process.memoryUsage();
  const schedulerStatus = getSchedulerStatus();
  const status = dbStatus === 'ok' ? 'ok' : 'degraded';
  res.status(dbStatus === 'ok' ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    database: dbStatus,
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    services: {
      rollout_scheduler: schedulerStatus.running ? 'ok' : 'stopped',
      alert_engine: 'ok',
    },
  });
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
app.use('/api/segments', segmentsRouter);
app.use('/api/schedules', schedulesRouter);

// Rollout scheduler status
app.get('/api/scheduler', (_req, res) => {
  res.json({ success: true, data: getSchedulerStatus() });
});

// Admin session routes (no auth required — handles login/logout)
app.use('/admin/session', express.json(), adminSessionRouter);

// Login page and its CSS — served without auth.
// express.static() needs a directory, not a file path, so use sendFile directly.
const adminDir = path.join(__dirname, '../public/admin');
app.get('/admin/login.html', (_req, res) => res.sendFile(path.join(adminDir, 'login.html')));
app.get('/admin/style.css',  (_req, res) => res.sendFile(path.join(adminDir, 'style.css')));

// All other /admin routes require a valid session cookie
app.use('/admin', requireAdminSession, express.static(adminDir));

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// 5xx — must have 4 params so Express treats it as an error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'unhandled error');
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ success: false, error: message });
});

const httpServer = http.createServer(app);

// WebSocket server — attach to same HTTP server on path /ws
const broadcastFn = attachWsServer(httpServer);
setBroadcast(broadcastFn);
setupRedisPubSub(broadcastFn);

function seedDemoData(): void {
  try {
    // Segments
    db.exec(`
      INSERT OR IGNORE INTO segments (id, key, name, description, rules, created_at, updated_at) VALUES
        ('seg-001', 'premium_users', 'Premium Users', 'Users with active premium plan',
         '[{"attribute":"plan","operator":"eq","value":"premium"}]',
         datetime('now'), datetime('now')),
        ('seg-002', 'beta_testers', 'Beta Testers', 'Internal beta testing group',
         '[{"attribute":"email_domain","operator":"eq","value":"rumik.internal"}]',
         datetime('now'), datetime('now')),
        ('seg-003', 'new_users', 'New Users', 'Users who joined less than 30 days ago',
         '[{"attribute":"account_age_days","operator":"lt","value":30}]',
         datetime('now'), datetime('now')),
        ('seg-004', 'power_users', 'Power Users', 'Long-term premium users',
         '[{"attribute":"plan","operator":"eq","value":"premium"},{"attribute":"account_age_days","operator":"gt","value":365}]',
         datetime('now'), datetime('now'))
    `);

    // Feature flags (table is feature_flags; columns: id, key, enabled, description, targeting, created_at, updated_at)
    // show_premium_upsell uses ON CONFLICT DO UPDATE to always keep targeting correct
    db.exec(`
      INSERT INTO feature_flags (id, key, enabled, description, targeting, created_at, updated_at) VALUES
        ('flag-001', 'show_premium_upsell', 1, 'Shows upsell card to free users',
         '{"platforms":["ios","android"],"user_attribute_rules":[{"attribute":"plan","operator":"neq","value":"premium"}]}',
         datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        targeting = '{"platforms":["ios","android"],"user_attribute_rules":[{"attribute":"plan","operator":"neq","value":"premium"}]}',
        updated_at = datetime('now')
    `);
    db.exec(`
      INSERT OR IGNORE INTO feature_flags (id, key, enabled, description, targeting, created_at, updated_at) VALUES
        ('flag-002', 'enable_social_share', 1, 'Share tracks to social media',
         NULL, datetime('now'), datetime('now')),
        ('flag-003', 'enable_offline_mode', 0, 'Download tracks for offline playback',
         '{"segment_keys":["premium_users"]}', datetime('now'), datetime('now')),
        ('flag-004', 'enable_lyrics_link', 1, 'Link to lyrics from now playing',
         NULL, datetime('now'), datetime('now')),
        ('flag-005', 'show_genre_pills', 1, 'Genre filter pills on home screen',
         NULL, datetime('now'), datetime('now')),
        ('flag-006', 'ios_exclusive_feature', 1, 'Haptic feedback on like — iOS only',
         '{"platforms":["ios"]}', datetime('now'), datetime('now')),
        ('flag-007', 'new_releases', 1, 'New Releases horizontal scroll on home screen',
         NULL, datetime('now'), datetime('now')),
        ('flag-008', 'new_onboarding', 1, 'Show new swipeable onboarding on first launch',
         NULL, datetime('now'), datetime('now'))
    `);

    // Experiments
    db.exec(`
      INSERT OR IGNORE INTO experiments (id, key, status, variants, targeting, created_at, updated_at) VALUES
        ('exp-001', 'home_layout', 'active',
         '[{"id":"control","weight":33},{"id":"grid","weight":33},{"id":"horizontal","weight":34}]',
         NULL, datetime('now'), datetime('now')),
        ('exp-002', 'player_ui', 'active',
         '[{"id":"control","weight":50},{"id":"immersive","weight":50}]',
         '{"segment_keys":["beta_testers"]}',
         datetime('now'), datetime('now')),
        ('exp-003', 'search_prompt_copy', 'active',
         '[{"id":"control","weight":50},{"id":"variant_a","weight":50}]',
         NULL, datetime('now'), datetime('now')),
        ('exp-004', 'tagline_test', 'active',
         '[{"id":"control","weight":50},{"id":"bold","weight":50}]',
         NULL, datetime('now'), datetime('now')),
        ('exp-005', 'chart_limit', 'active',
         '[{"id":"8","weight":34},{"id":"10","weight":33},{"id":"15","weight":33}]',
         NULL, datetime('now'), datetime('now'))
    `);

    // Kill switches (targeting column added via migration in db.ts)
    db.exec(`
      INSERT OR IGNORE INTO kill_switches (id, key, active, reason, targeting, created_at, updated_at) VALUES
        ('ks-001', 'disable_web_payments', 1, 'Web payment processor outage', NULL, datetime('now'), datetime('now')),
        ('ks-002', 'disable_podcast_tab', 0, 'Podcast feature temporarily disabled', NULL, datetime('now'), datetime('now')),
        ('ks-003', 'disable_recommendations', 0, 'Recommendation engine maintenance', '{"platforms":["web"]}', datetime('now'), datetime('now')),
        ('ks-004', 'disable_search', 0, 'Emergency search kill switch', NULL, datetime('now'), datetime('now'))
    `);

    // Demo schedules
    db.exec(`
      INSERT OR IGNORE INTO flag_schedules (id, entity_type, entity_id, action, payload, scheduled_at, executed_at, created_by, created_at) VALUES
        ('sched-001', 'flag', 'flag-002', 'activate', NULL,
         datetime('now', '+7 days'), NULL, 'seed', datetime('now')),
        ('sched-002', 'flag', 'flag-003', 'activate', NULL,
         datetime('now', '+14 days'), NULL, 'seed', datetime('now')),
        ('sched-003', 'experiment', 'exp-001', 'complete', NULL,
         datetime('now', '+30 days'), NULL, 'seed', datetime('now'))
    `);

    logger.info('Demo data seeded successfully');
  } catch (e) {
    logger.warn({ err: e }, 'Demo data seeding error (may already exist)');
  }
}

httpServer.listen(PORT, () => {
  const authMode = process.env.OTA_API_KEY ? 'bearer auth enabled' : 'auth disabled (dev)';
  logger.info({ port: PORT, authMode }, 'OTA server listening');
  logger.info({ url: `ws://localhost:${PORT}/ws` }, 'WebSocket server ready');
  if (process.env.NODE_ENV === 'production' && !process.env.OTA_API_KEY) {
    logger.error('OTA_API_KEY is not set — admin access is unsecured in production');
  }
  runMigrations().catch(e => logger.error({ err: e }, 'Migration failed'));
  seedDemoData();
  startRolloutScheduler();
  // Alert engine: evaluate rules immediately at startup then every 5 minutes
  runAlertEngine().catch(e => logger.error({ err: e }, 'alertEngine startup error'));
  setInterval(() => { runAlertEngine().catch(e => logger.error({ err: e }, 'alertEngine error')); }, 5 * 60_000);
  // Data TTL cleanup: run at startup (after 5s) then daily
  setTimeout(() => { try { runCleanup(); } catch (e) { logger.warn({ err: e }, 'cleanup startup error'); } }, 5_000);
  setInterval(() => { try { runCleanup(); } catch (e) { logger.warn({ err: e }, 'cleanup error'); } }, 24 * 60 * 60_000);
});

export { app };
export default httpServer;
