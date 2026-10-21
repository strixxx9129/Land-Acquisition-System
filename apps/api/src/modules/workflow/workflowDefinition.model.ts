import { model, Schema, type InferSchemaType } from 'mongoose';

export const WORKFLOW_STATUSES = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;

/**
 * One version of a legal workflow. Versions are immutable once activated; editing means creating a
 * new version. Each case pins the version it started on, so in-flight cases never change rules midway.
 */
const workflowDefinitionSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    version: { type: Number, required: true, min: 1 },
    status: { type: String, enum: WORKFLOW_STATUSES, required: true, default: 'DRAFT' },
    /** Validated against workflowContentSchema + consistency checks before every save. */
    content: { type: Schema.Types.Mixed, required: true },
    notes: { type: String, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    activatedAt: Date,
    retiredAt: Date,
  },
  { timestamps: true, minimize: false },
);

workflowDefinitionSchema.index({ code: 1, version: 1 }, { unique: true });
workflowDefinitionSchema.index({ code: 1, status: 1 });

export type WorkflowDefinitionDoc = InferSchemaType<typeof workflowDefinitionSchema>;
export const WorkflowDefinition = model('WorkflowDefinition', workflowDefinitionSchema);
