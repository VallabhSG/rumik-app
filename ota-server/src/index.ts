import http from 'http';
import path from 'path';
import express from 'express';
import { bearerAuth } from './middleware/auth.js';
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
import { attachWsServer } from './ws.js';
import { startRolloutScheduler, getSchedulerStatus } from './rolloutScheduler.js';
import { runAlertEngine } from './services/alertEngine.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(express.json());

// Health check — no auth
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// All /api routes require bearer auth
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

// Admin dashboard — served as static files (no auth, JS calls API with stored token)
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

const httpServer = http.createServer(app);

// WebSocket server — attach to same HTTP server on path /ws
const broadcastFn = attachWsServer(httpServer);
setBroadcast(broadcastFn);

httpServer.listen(PORT, () => {
  const authMode = process.env.OTA_API_KEY ? 'bearer auth enabled' : 'auth disabled (dev)';
  console.log(`OTA server listening on port ${PORT} — ${authMode}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}/ws`);
  startRolloutScheduler();
  // Alert engine: evaluate rules every 5 minutes
  setInterval(() => { runAlertEngine().catch(e => console.error('[alertEngine] error:', e)); }, 5 * 60_000);
});

export { app };
export default httpServer;
