import type { RequestHandler } from 'express';
import type { PermissionCode } from '@lams/shared';
import { AppError, forbidden, unauthorized } from '../../lib/errors.js';
import { currentUserActor, runAs } from '../access/context.js';
import { loadPrincipal, type Principal } from './auth.service.js';
import { verifyAccessToken } from './tokens.js';

declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal;
  }
}

/**
 * Verifies the bearer token and runs the rest of the request as that user, so every
 * Mongoose query below is automatically limited to the user's jurisdiction.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let claims;
  try {
    claims = verifyAccessToken(header.slice(7));
  } catch (err) {
    const expired = (err as Error).name === 'TokenExpiredError';
    throw new AppError(401, expired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED', expired ? 'Session expired' : 'Invalid token');
  }
  const principal = await loadPrincipal(claims.sub, claims.tv);
  if (!principal) throw new AppError(401, 'SESSION_REVOKED', 'Your session is no longer valid. Please sign in again.');
  req.principal = principal;
  // Everything downstream of next() inherits this async context.
  await runAs(principal.actor, () => next());
};

/** Must come after requireAuth. Fails closed if the role lacks any of the listed permissions. */
export function requirePermission(...codes: PermissionCode[]): RequestHandler {
  return (_req, _res, next) => {
    const actor = currentUserActor();
    if (!codes.every((c) => actor.permissions.has(c))) throw forbidden();
    next();
  };
}
