import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { ScopeError } from '../modules/access/context.js';
import { IntegrationError } from '../modules/integrations/types.js';
import { logger } from '../logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}`, requestId: String(req.id) } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id);
  const send = (status: number, code: string, message: string, details?: unknown) =>
    res.status(status).json({ error: { code, message, requestId, ...(details === undefined ? {} : { details }) } });

  if (err instanceof AppError) return send(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) {
    return send(400, 'VALIDATION_FAILED', 'Some fields are invalid', err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  if (err instanceof ScopeError) {
    // Logged loudly: this means a code path tried to read or write outside the user's jurisdiction.
    logger.warn({ requestId, err: err.message }, 'jurisdiction scope violation');
    return send(403, 'OUT_OF_SCOPE', 'This record is outside your jurisdiction');
  }
  if (err instanceof IntegrationError) {
    logger.warn({ requestId, source: err.source, err: err.message }, 'integration failure');
    return send(502, 'INTEGRATION_FAILED', `${err.source}: ${err.message}`);
  }
  if (err instanceof mongoose.Error.CastError) return send(400, 'BAD_REQUEST', `Invalid value for ${err.path}`);
  if (err instanceof mongoose.Error.ValidationError) {
    return send(400, 'VALIDATION_FAILED', 'Some fields are invalid', Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })));
  }
  if ((err as { code?: number }).code === 11000) return send(409, 'DUPLICATE', 'A record with the same unique value already exists');
  if ((err as { type?: string }).type === 'entity.too.large') return send(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  if ((err as { type?: string }).type === 'entity.parse.failed') return send(400, 'BAD_REQUEST', 'Malformed JSON body');

  logger.error({ requestId, err }, 'unhandled error');
  return send(500, 'INTERNAL', 'Something went wrong. Quote the request id if you report this.');
};
