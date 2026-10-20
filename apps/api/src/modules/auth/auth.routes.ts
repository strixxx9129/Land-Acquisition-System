import { Router, type CookieOptions, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { loginRequestSchema, type DemoAccount, type LoginResponse } from '@lams/shared';
import { config, isProd } from '../../config.js';
import { AppError, notFound } from '../../lib/errors.js';
import { runAsSystem } from '../access/context.js';
import { getRole } from '../access/roles.service.js';
import { scopeLabel } from '../masters/scopeLabel.service.js';
import { User } from '../users/user.model.js';
import { authenticate, loadPrincipal, toAuthUser, userScope, type Principal } from './auth.service.js';
import { requireAuth } from './auth.middleware.js';
import { createRefreshSession, revokeByCookie, rotateRefreshSession, signAccessToken } from './tokens.js';

export const REFRESH_COOKIE = 'lams_rt';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  // The web app reaches the API through a same-origin rewrite, so Lax is enough and avoids third-party-cookie blocking.
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: config.LOGIN_RATE_LIMIT_PER_15_MIN,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please wait a few minutes.' } },
});

async function sendSession(res: Response, principal: Principal, refreshCookie: string) {
  res.cookie(REFRESH_COOKIE, refreshCookie, cookieOptions);
  const body: LoginResponse = {
    accessToken: signAccessToken({ sub: principal.actor.userId, role: principal.role.code, tv: principal.user.tokenVersion ?? 0 }),
    expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
    user: await toAuthUser(principal),
  };
  res.json(body);
}

export const authRouter = Router();

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = loginRequestSchema.parse(req.body);
  const principal = await authenticate(email, password);
  const cookie = await createRefreshSession(principal.actor.userId, req.get('user-agent'));
  await sendSession(res, principal, cookie);
});

authRouter.post('/refresh', async (req, res) => {
  const result = await rotateRefreshSession(req.cookies?.[REFRESH_COOKIE], req.get('user-agent'));
  if (!result.ok) {
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: undefined });
    throw new AppError(401, 'REFRESH_FAILED', result.reason === 'reused' ? 'Session ended for security reasons. Please sign in again.' : 'Please sign in.');
  }
  const tokenVersion = await runAsSystem('refresh', async () => (await User.findById(result.userId).select('tokenVersion').lean())?.tokenVersion ?? 0);
  const principal = await loadPrincipal(result.userId, tokenVersion);
  if (!principal) throw new AppError(401, 'REFRESH_FAILED', 'Please sign in.');
  await sendSession(res, principal, result.cookie);
});

authRouter.post('/logout', async (req, res) => {
  await revokeByCookie(req.cookies?.[REFRESH_COOKIE], 'logout');
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await toAuthUser(req.principal!));
});

/** Public list of demo logins for judges. Exists only when DEMO_MODE=true. */
authRouter.get('/demo-accounts', async (_req, res) => {
  if (!config.DEMO_MODE) throw notFound();
  const users = await runAsSystem('demo-accounts', () => User.find({ isDemo: true, active: true }).sort({ createdAt: 1 }).lean());
  const accounts: DemoAccount[] = [];
  for (const user of users) {
    const role = await getRole(user.roleCode);
    if (!role) continue;
    accounts.push({ email: user.email, roleName: role.name as DemoAccount['roleName'], scopeLabel: await scopeLabel(userScope(user, role)) });
  }
  res.json({ password: config.DEMO_USER_PASSWORD, accounts });
});
