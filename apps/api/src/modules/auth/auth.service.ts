import bcrypt from 'bcryptjs';
import type { AuthUser, LocalizedText, PermissionCode, UserScope } from '@lams/shared';
import { config } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import { runAsSystem, type UserActor } from '../access/context.js';
import type { RoleDoc } from '../access/role.model.js';
import { getRole } from '../access/roles.service.js';
import { scopeLabel } from '../masters/scopeLabel.service.js';
import { User } from '../users/user.model.js';

interface UserRecord {
  _id: unknown;
  name: string;
  email: string;
  locale?: string | null;
  roleCode: string;
  stateCode?: string | null;
  districtCode?: string | null;
  organizationCode?: string | null;
  active?: boolean | null;
  tokenVersion?: number | null;
}

export interface Principal {
  user: UserRecord;
  role: RoleDoc;
  actor: UserActor;
}

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

export function userScope(user: UserRecord, role: RoleDoc): UserScope {
  return {
    level: role.scopeLevel,
    ...(user.stateCode ? { stateCode: user.stateCode } : {}),
    ...(user.districtCode ? { districtCode: user.districtCode } : {}),
    ...(user.organizationCode ? { organizationCode: user.organizationCode } : {}),
  };
}

function toPrincipal(user: UserRecord, role: RoleDoc): Principal {
  return {
    user,
    role,
    actor: {
      kind: 'user',
      userId: String(user._id),
      roleCode: role.code,
      scope: userScope(user, role),
      permissions: new Set(role.permissions),
    },
  };
}

const PRINCIPAL_TTL_MS = 30_000;
const principalCache = new Map<string, { at: number; principal: Principal }>();

/** Loads the user behind a token. Cached briefly; a tokenVersion bump or deactivation takes effect within 30 s. */
export async function loadPrincipal(userId: string, tokenVersion: number): Promise<Principal | null> {
  const hit = principalCache.get(userId);
  let principal = hit && Date.now() - hit.at < PRINCIPAL_TTL_MS ? hit.principal : null;
  if (!principal) {
    const user = await runAsSystem('auth', () => User.findById(userId).lean<UserRecord>());
    const role = user ? await getRole(user.roleCode) : undefined;
    if (!user || !role) return null;
    principal = toPrincipal(user, role);
    principalCache.set(userId, { at: Date.now(), principal });
  }
  if (!principal.user.active || (principal.user.tokenVersion ?? 0) !== tokenVersion) return null;
  return principal;
}

export function forgetPrincipal(userId?: string): void {
  if (userId) principalCache.delete(userId);
  else principalCache.clear();
}

export async function authenticate(email: string, password: string): Promise<Principal> {
  return runAsSystem('login', async () => {
    const user = await User.findOne({ email }).select('+passwordHash +failedLoginCount +lockedUntil');
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw invalidCredentials();
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AppError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${minutes} minute(s).`);
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const failed = (user.failedLoginCount ?? 0) + 1;
      const lock = failed >= config.LOGIN_MAX_ATTEMPTS;
      await User.updateOne(
        { _id: user._id },
        lock
          ? { $set: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + config.LOGIN_LOCK_MINUTES * 60_000) } }
          : { $set: { failedLoginCount: failed } },
      );
      throw invalidCredentials();
    }
    if (!user.active) throw invalidCredentials();
    const role = await getRole(user.roleCode);
    if (!role) throw new AppError(403, 'ROLE_MISSING', 'Your account has no valid role. Contact the administrator.');

    await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: 1 } });
    forgetPrincipal(user.id);
    const { passwordHash: _hash, failedLoginCount: _f, lockedUntil: _l, ...safe } = user.toObject();
    return toPrincipal(safe as UserRecord, role);
  });
}

export async function toAuthUser({ user, role, actor }: Principal): Promise<AuthUser> {
  return {
    id: actor.userId,
    name: user.name,
    email: user.email,
    locale: user.locale ?? 'en',
    role: { code: role.code, name: role.name as LocalizedText },
    scope: actor.scope,
    scopeLabel: await scopeLabel(actor.scope),
    permissions: [...actor.permissions] as PermissionCode[],
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.BCRYPT_COST);
}
