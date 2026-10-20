import { Router } from 'express';
import mongoose from 'mongoose';
import { config } from '../../config.js';

export const healthRouter = Router();

/** Liveness. Deliberately touches nothing else: uptime monitors hit this every few minutes. */
healthRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({
    status: 'ok',
    version: config.APP_VERSION,
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
});

/** Readiness: can we actually serve requests? Used by the web app's wake-up check and by Render. */
healthRouter.get('/ready', async (_req, res) => {
  const checks: Record<string, 'ok' | 'down'> = {};
  try {
    await mongoose.connection.db?.admin().ping();
    checks.database = mongoose.connection.readyState === 1 ? 'ok' : 'down';
  } catch {
    checks.database = 'down';
  }
  const ready = Object.values(checks).every((c) => c === 'ok');
  res.status(ready ? 200 : 503).set('Cache-Control', 'no-store').json({ status: ready ? 'ok' : 'degraded', checks });
});
