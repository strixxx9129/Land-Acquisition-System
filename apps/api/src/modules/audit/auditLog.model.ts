import { model, Schema } from 'mongoose';
import { currentActor } from '../access/context.js';

/** Append-only record of administrative and sensitive actions (config changes, PII reveals, ...). */
const auditLogSchema = new Schema(
  {
    at: { type: Date, default: () => new Date(), index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorKind: { type: String, enum: ['user', 'system'], required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    requestId: String,
  },
  { versionKey: false },
);
auditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });

const immutable = () => {
  throw new Error('Audit log entries cannot be changed or deleted');
};
auditLogSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  immutable,
);
auditLogSchema.pre('save', function () {
  if (!this.isNew) immutable();
});

export const AuditLog = model('AuditLog', auditLogSchema);

export async function audit(entry: { action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; requestId?: string }) {
  const actor = currentActor();
  await AuditLog.create({
    ...entry,
    actorKind: actor.kind,
    actorUserId: actor.kind === 'user' ? actor.userId : undefined,
  });
}
