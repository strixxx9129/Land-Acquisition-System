import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { rolesRouter } from './modules/admin/roles.routes.js';
import { requireAuth } from './modules/auth/auth.middleware.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { mastersRouter } from './modules/masters/masters.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { openApiDocument } from './openapi.js';

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

  app.get('/api/openapi.json', (_req, res) => res.json(openApiDocument()));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(undefined, { swaggerOptions: { url: '/api/openapi.json' }, customSiteTitle: 'LAMS API' }));

  app.use('/api/auth', authRouter);
  app.use('/api/admin/roles', requireAuth, rolesRouter);
  app.use('/api/users', requireAuth, usersRouter);
  app.use('/api/masters', requireAuth, mastersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
