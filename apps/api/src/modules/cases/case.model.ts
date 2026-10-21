import { model, Schema, type InferSchemaType } from 'mongoose';
import { CASE_STATUSES, PROJECT_TYPES, PUBLIC_PURPOSES } from '@lams/shared';
import { jurisdictionScoped } from '../access/scopePlugin.js';

/** An acquisition case: one project's journey through a legal workflow in one district. */
const caseSchema = new Schema(
  {
    caseNumber: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    projectType: { type: String, enum: PROJECT_TYPES.map((p) => p.code), required: true },
    publicPurpose: { type: String, enum: PUBLIC_PURPOSES.map((p) => p.code), required: true },
    purpose: { type: String, required: true, maxlength: 4000 },
    areaProposedHa: { type: Number, required: true, min: 0 },
    estimatedCostCr: { type: Number, min: 0 },
    affectedFamiliesEstimate: { type: Number, min: 0 },
    villages: { type: [String], default: [] },
    urgency: { type: Boolean, default: false },

    stateCode: { type: String, required: true },
    districtCode: { type: String, required: true },
    organizationCode: { type: String, required: true },

    workflowCode: { type: String, required: true },
    workflowVersion: { type: Number, required: true },
    currentStage: { type: String, required: true },
    status: { type: String, enum: CASE_STATUSES, required: true, default: 'ACTIVE' },
    stageEnteredAt: { type: Date, required: true },
    /** Stage code -> official date the case first entered it. Statutory deadlines are computed from these. */
    stageDates: { type: Map, of: Date, default: {} },
    /** Latest value of every input captured by transitions (gazette numbers, dates, ...). */
    recorded: { type: Schema.Types.Mixed, default: {} },

    /** Optimistic-lock counter: every change must quote the version it read. */
    version: { type: Number, required: true, default: 0 },
    eventCount: { type: Number, required: true, default: 0 },
    lastEventHash: { type: String, default: '' },
    lastActionAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    /** Set only on synthetic demo cases, so re-seeding can replace them without touching real ones. */
    seedKey: { type: String },
  },
  { timestamps: true, minimize: false },
);

caseSchema.index({ stateCode: 1, districtCode: 1, status: 1 });
caseSchema.index({ organizationCode: 1, status: 1 });
caseSchema.index({ status: 1, workflowCode: 1, workflowVersion: 1, currentStage: 1 });
caseSchema.index({ seedKey: 1 }, { unique: true, sparse: true });

jurisdictionScoped(caseSchema, { state: 'stateCode', district: 'districtCode', organization: 'organizationCode' });

export type CaseDoc = InferSchemaType<typeof caseSchema>;
export const Case = model('Case', caseSchema);
