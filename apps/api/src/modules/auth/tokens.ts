import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';
import { config } from '../../config.js';
import { Session } from './session.model.js';

const ISSUER = 'lams-api';
const AUDIENCE = 'lams-web';

export interface AccessClaims {
  sub: string;
  role: string;
  /** User.tokenVersion at issue time; a mismatch means the user's sessions were revoked. */
  tv: number;
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, config.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  // Pinning the algorithm blocks "alg: none" and algorithm-confusion attacks.
  const payload = jwt.verify(token, config.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('malformed token');
  return { sub: payload.sub, role: String(payload.role), tv: Number(payload.tv) };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/** Creates a refresh session and returns the opaque cookie value `<sessionId>.<secret>`. */
export async function createRefreshSession(userId: Types.ObjectId | string, userAgent?: string, familyId: string = randomUUID()) {
  const secret = randomBytes(32).toString('base64url');
  const session = await Session.create({
    userId,
    familyId,
    tokenHash: sha256(secret).toString('hex'),
    expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    userAgent: userAgent?.slice(0, 300),
  });
  return `${session.id}.${secret}`;
}

export type RotateResult = { ok: true; userId: string; cookie: string } | { ok: false; reason: 'invalid' | 'expired' | 'reused' };

/** Exchanges a refresh token for a new one. Presenting an already-rotated token revokes its whole family. */
export async function rotateRefreshSession(cookie: string | undefined, userAgent?: string): Promise<RotateResult> {
  const [id, secret] = (cookie ?? '').split('.');
  if (!id || !secret || !/^[a-f0-9]{24}$/.test(id)) return { ok: false, reason: 'invalid' };

  const session = await Session.findById(id);
  if (!session) return { ok: false, reason: 'invalid' };
  const expected = Buffer.from(session.tokenHash, 'hex');
  const given = sha256(secret);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'invalid' };
  if (session.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  // Atomic claim: only one request can rotate a given token, even if two arrive at once.
  const claimed = await Session.findOneAndUpdate(
    { _id: session._id, rotatedAt: null, revokedAt: null },
    { $set: { rotatedAt: new Date() } },
  );
  if (!claimed) {
    await revokeFamily(session.familyId, 'refresh token reused');
    return { ok: false, reason: 'reused' };
  }
  const next = await createRefreshSession(session.userId, userAgent, session.familyId);
  return { ok: true, userId: String(session.userId), cookie: next };
}

export async function revokeFamily(familyId: string, reason: string) {
  await Session.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
}

export async function revokeByCookie(cookie: string | undefined, reason: string) {
  const [id] = (cookie ?? '').split('.');
  if (!id || !/^[a-f0-9]{24}$/.test(id)) return;
  const session = await Session.findById(id).lean();
  if (session) await revokeFamily(session.familyId, reason);
}
