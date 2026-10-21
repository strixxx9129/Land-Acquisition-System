import { model, Schema, type InferSchemaType } from 'mongoose';
import { canonicalJson, sha256Hex } from '../../lib/hash.js';
import { jurisdictionScoped } from '../access/scopePlugin.js';

/**
 * Append-only history of a case. Each event stores the hash of the previous one, so altering or
 * deleting any past event breaks the chain and is detectable (GET /cases/:id/integrity).
 */
const caseEventSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: 'Case', required: true },
    seq: { type: Number, required: true },
    at: { type: Date, required: true },
    actor: {
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      name: String,
      roleCode: String,
    },
    action: { type: String, required: true },
    fromStage: String,
    toStage: String,
    remarks: { type: String, maxlength: 4000 },
    inputs: { type: Schema.Types.Mixed },
    effectiveDate: Date,
    workflowCode: String,
    workflowVersion: Number,
    stateCode: { type: String, required: true },
    districtCode: { type: String, required: true },
    organizationCode: { type: String, required: true },
    prevHash: { type: String, default: '' },
    hash: { type: String, required: true },
  },
  { versionKey: false, minimize: false },
);

// One event per sequence number per case: a second concurrent append fails instead of forking history.
caseEventSchema.index({ caseId: 1, seq: 1 }, { unique: true });
caseEventSchema.index({ 'actor.userId': 1, at: -1 });

const immutable = () => {
  throw new Error('Case history cannot be changed or deleted');
};
caseEventSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  immutable,
);
caseEventSchema.pre('save', function () {
  if (!this.isNew) immutable();
});

jurisdictionScoped(caseEventSchema, { state: 'stateCode', district: 'districtCode', organization: 'organizationCode' });

export type CaseEventDoc = InferSchemaType<typeof caseEventSchema>;
export const CaseEvent = model('CaseEvent', caseEventSchema);

type HashInput = Pick<CaseEventDoc, 'seq' | 'at' | 'action' | 'prevHash'> & {
  caseId: unknown;
  actor?: { userId?: unknown; roleCode?: string | null } | null;
  fromStage?: string | null;
  toStage?: string | null;
  remarks?: string | null;
  inputs?: unknown;
  effectiveDate?: Date | null;
};

export function eventHash(e: HashInput): string {
  return sha256Hex(
    canonicalJson({
      caseId: String(e.caseId),
      seq: e.seq,
      at: new Date(e.at).toISOString(),
      actorUserId: e.actor?.userId ? String(e.actor.userId) : null,
      roleCode: e.actor?.roleCode ?? null,
      action: e.action,
      fromStage: e.fromStage ?? null,
      toStage: e.toStage ?? null,
      remarks: e.remarks ?? null,
      inputs: e.inputs ?? null,
      effectiveDate: e.effectiveDate ? new Date(e.effectiveDate).toISOString() : null,
      prevHash: e.prevHash ?? '',
    }),
  );
}
