import express from 'express';
import { bearerAuth } from './middleware/auth.js';
import releasesRouter from './routes/releases.js';
import rollbacksRouter from './routes/rollbacks.js';
import metricsRouter from './routes/metrics.js';
import { startRolloutScheduler, getSchedulerStatus } from './rolloutScheduler.js';

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

// Rollout scheduler status
app.get('/api/scheduler', (_req, res) => {
  res.json({ success: true, data: getSchedulerStatus() });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

app.listen(PORT, () => {
  const authMode = process.env.OTA_API_KEY ? 'bearer auth enabled' : 'auth disabled (dev)';
  console.log(`OTA server listening on port ${PORT} — ${authMode}`);
  startRolloutScheduler();
});

export default app;
