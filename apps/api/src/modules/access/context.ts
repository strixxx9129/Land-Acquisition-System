import { AsyncLocalStorage } from 'node:async_hooks';
import type { ScopeLevel } from '@lams/shared';

/** The authenticated user a request runs as, as far as data access is concerned. */
export interface UserActor {
  kind: 'user';
  userId: string;
  roleCode: string;
  scope: { level: ScopeLevel; stateCode?: string; districtCode?: string; organizationCode?: string };
  permissions: ReadonlySet<string>;
}

/** Seeds, scheduled jobs and login run as the system and see everything. */
export interface SystemActor {
  kind: 'system';
  reason: string;
}

export type Actor = UserActor | SystemActor;

export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeError';
  }
}

const storage = new AsyncLocalStorage<Actor>();

/**
 * Runs fn as the actor. The result is awaited *inside* the context on purpose: Mongoose queries
 * are lazy thenables, and one returned unawaited would execute after the context had ended.
 */
export function runAs<T>(actor: Actor, fn: () => T | PromiseLike<T>): Promise<T> {
  return storage.run(actor, async () => await fn());
}

export function runAsSystem<T>(reason: string, fn: () => T | PromiseLike<T>): Promise<T> {
  return runAs({ kind: 'system', reason }, fn);
}

/** Returns the current actor, or throws: data access with no known actor is denied by default. */
export function currentActor(): Actor {
  const actor = storage.getStore();
  if (!actor) throw new ScopeError('No actor in context: scoped data access must run inside runAs()/runAsSystem()');
  return actor;
}

export function currentUserActor(): UserActor {
  const actor = currentActor();
  if (actor.kind !== 'user') throw new ScopeError('This operation needs a signed-in user');
  return actor;
}
