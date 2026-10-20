import type { Schema } from 'mongoose';
import { currentActor, ScopeError, type Actor } from './context.js';

/** Which document fields hold the jurisdiction keys for a scoped collection. */
export interface ScopeFields {
  state?: string;
  district?: string;
  organization?: string;
}

interface ScopeResult {
  /** True when the actor's level has no matching field on this collection: they see nothing. */
  denied: boolean;
  /** Field -> required value. Empty for national users and the system. */
  equals: Record<string, string>;
}

export function resolveScope(actor: Actor, fields: ScopeFields): ScopeResult {
  if (actor.kind === 'system') return { denied: false, equals: {} };
  const { scope } = actor;
  const one = (field: string | undefined, value: string | undefined): ScopeResult =>
    field && value ? { denied: false, equals: { [field]: value } } : { denied: true, equals: {} };
  switch (scope.level) {
    case 'NATIONAL':
      return { denied: false, equals: {} };
    case 'STATE':
      return one(fields.state, scope.stateCode);
    case 'DISTRICT':
      return one(fields.district, scope.districtCode);
    case 'ORGANIZATION':
      return one(fields.organization, scope.organizationCode);
    default:
      return { denied: true, equals: {} };
  }
}

/** The Mongo filter that limits a query to what the actor may see (deny by default). */
export function scopeFilter(actor: Actor, fields: ScopeFields): Record<string, unknown> {
  const { denied, equals } = resolveScope(actor, fields);
  return denied ? { _id: { $exists: false } } : { ...equals };
}

function readPath(obj: unknown, path: string): unknown {
  if (obj && typeof (obj as { get?: unknown }).get === 'function') return (obj as { get(p: string): unknown }).get(path);
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** Throws unless a document lies inside the actor's jurisdiction. */
export function assertInScope(actor: Actor, fields: ScopeFields, doc: unknown, what = 'record'): void {
  const { denied, equals } = resolveScope(actor, fields);
  if (denied) throw new ScopeError(`Your role cannot write this ${what}`);
  for (const [path, expected] of Object.entries(equals)) {
    if (readPath(doc, path) !== expected) throw new ScopeError(`This ${what} is outside your jurisdiction`);
  }
}

/** Scope fields an update would set; they must stay inside the actor's jurisdiction. */
function assertUpdateStaysInScope(actor: Actor, fields: ScopeFields, update: Record<string, unknown>): void {
  const { equals } = resolveScope(actor, fields);
  const set = (update.$set ?? {}) as Record<string, unknown>;
  for (const [path, expected] of Object.entries(equals)) {
    const next = path in set ? set[path] : update[path];
    if (next !== undefined && next !== expected) throw new ScopeError('Cannot move a record outside your jurisdiction');
  }
}

const QUERY_HOOKS = [
  'find',
  'findOne',
  'countDocuments',
  'distinct',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
];

/**
 * Enforces jurisdiction scoping on every read and write of a collection.
 * The actor comes from AsyncLocalStorage, so a query issued outside a request or job context throws.
 */
export function jurisdictionScoped(schema: Schema, fields: ScopeFields): void {
  schema.pre(QUERY_HOOKS as any, function (this: any) {
    const actor = currentActor();
    this.where(scopeFilter(actor, fields));
    const update = typeof this.getUpdate === 'function' ? this.getUpdate() : null;
    if (update && !Array.isArray(update)) assertUpdateStaysInScope(actor, fields, update);
  });

  schema.pre('aggregate', function (this: any) {
    const filter = scopeFilter(currentActor(), fields);
    if (Object.keys(filter).length === 0) return;
    const pipeline = this.pipeline();
    const first = pipeline[0];
    // $geoNear must stay the first stage, so its own `query` option carries the scope instead.
    if (first && '$geoNear' in first) first.$geoNear.query = { $and: [first.$geoNear.query ?? {}, filter] };
    else pipeline.unshift({ $match: filter });
  });

  schema.pre('save', function (this: any) {
    assertInScope(currentActor(), fields, this, this.constructor.modelName);
  });

  schema.pre('insertMany', function (this: any, next: (err?: Error) => void, docs: unknown) {
    try {
      const actor = currentActor();
      for (const doc of Array.isArray(docs) ? docs : [docs]) assertInScope(actor, fields, doc, this.modelName);
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  schema.pre('bulkWrite', function (this: any, next: (err?: Error) => void) {
    // Bulk writes can't be checked op by op cheaply; only the system (seeds, jobs) may use them.
    next(currentActor().kind === 'system' ? undefined : new ScopeError('Bulk writes are restricted to system jobs'));
  });
}
