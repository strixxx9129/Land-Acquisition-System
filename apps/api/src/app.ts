import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { docsRouter } from './docs.js';
import { logger } from './logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { rolesRouter } from './modules/admin/roles.routes.js';
import { requireAuth } from './modules/auth/auth.middleware.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { mastersRouter } from './modules/masters/masters.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { casesRouter } from './modules/cases/cases.routes.js';
import { workflowRouter } from './modules/workflow/workflow.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // Health pings arrive every few minutes; logging them is noise.
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
      // One compact line per request; headers carry nothing we need in logs.
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.CORS_ORIGINS.includes(origin)),
      credentials: true,
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/health', healthRouter);

  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60_000,
      limit: config.RATE_LIMIT_PER_15_MIN,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
    }),
  );

  app.use('/api', docsRouter);

  app.use('/api/auth', authRouter);
  app.use('/api/admin/roles', requireAuth, rolesRouter);
  app.use('/api/users', requireAuth, usersRouter);
  app.use('/api/masters', requireAuth, mastersRouter);
  app.use('/api/workflows', requireAuth, workflowRouter);
  app.use('/api/cases', requireAuth, casesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
