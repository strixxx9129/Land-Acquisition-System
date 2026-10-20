import { Role, type RoleDoc } from './role.model.js';

const TTL_MS = 60_000;
let cache: { loadedAt: number; byCode: Map<string, RoleDoc> } | null = null;

/** Roles change rarely and are read on every request, so they are cached briefly in memory. */
export async function getRole(code: string): Promise<RoleDoc | undefined> {
  if (!cache || Date.now() - cache.loadedAt > TTL_MS) {
    const roles = await Role.find().lean<RoleDoc[]>();
    cache = { loadedAt: Date.now(), byCode: new Map(roles.map((r) => [r.code, r])) };
  }
  return cache.byCode.get(code);
}

export function invalidateRoleCache(): void {
  cache = null;
}
