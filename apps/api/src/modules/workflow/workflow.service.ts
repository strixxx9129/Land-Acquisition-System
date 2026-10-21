import mongoose from 'mongoose';
import { checkWorkflowConsistency, workflowContentSchema, type WorkflowContent } from '@lams/shared';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { currentActor } from '../access/context.js';
import { Role } from '../access/role.model.js';
import { audit } from '../audit/auditLog.model.js';
import { WorkflowDefinition } from './workflowDefinition.model.js';

export interface LoadedWorkflow {
  code: string;
  version: number;
  status: string;
  content: WorkflowContent;
}

// Activated versions never change, so they can be cached forever.
const frozen = new Map<string, LoadedWorkflow>();

/** Parses and cross-checks workflow content; throws a 400 listing every problem. */
export async function validateWorkflowContent(raw: unknown): Promise<WorkflowContent> {
  const parsed = workflowContentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(400, 'WORKFLOW_INVALID', 'The workflow definition is invalid', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const roles = new Set((await Role.find().select('code').lean()).map((r) => r.code));
  const issues = checkWorkflowConsistency(parsed.data, roles);
  if (issues.length) throw new AppError(400, 'WORKFLOW_INVALID', 'The workflow definition is inconsistent', issues);
  return parsed.data;
}

export async function getWorkflow(code: string, version: number): Promise<LoadedWorkflow> {
  const key = `${code}@${version}`;
  const hit = frozen.get(key);
  if (hit) return hit;
  const doc = await WorkflowDefinition.findOne({ code, version }).lean();
  if (!doc) throw notFound(`Workflow ${code} v${version} not found`);
  const loaded: LoadedWorkflow = { code: doc.code, version: doc.version, status: doc.status, content: workflowContentSchema.parse(doc.content) };
  if (doc.status !== 'DRAFT') frozen.set(key, loaded);
  return loaded;
}

export async function getActiveWorkflow(code: string): Promise<LoadedWorkflow> {
  const doc = await WorkflowDefinition.findOne({ code, status: 'ACTIVE' }).select('version').lean();
  if (!doc) throw new AppError(400, 'NO_ACTIVE_WORKFLOW', `Workflow ${code} has no active version`);
  return getWorkflow(code, doc.version);
}

export async function listActiveWorkflows(): Promise<LoadedWorkflow[]> {
  const docs = await WorkflowDefinition.find({ status: 'ACTIVE' }).select('code version').sort({ code: 1 }).lean();
  return Promise.all(docs.map((d) => getWorkflow(d.code, d.version)));
}

/** Creates the next version of a workflow (or version 1 of a new one) as a draft. */
export async function createWorkflowVersion(code: string, rawContent: unknown, notes?: string) {
  const content = await validateWorkflowContent(rawContent);
  const latest = await WorkflowDefinition.findOne({ code }).sort({ version: -1 }).select('version').lean();
  const actor = currentActor();
  const doc = await WorkflowDefinition.create({
    code,
    version: (latest?.version ?? 0) + 1,
    status: 'DRAFT',
    content,
    notes,
    createdBy: actor.kind === 'user' ? actor.userId : undefined,
  });
  await audit({ action: 'workflow.create_version', entityType: 'WorkflowDefinition', entityId: `${code}@${doc.version}`, after: { notes } });
  return doc;
}

export async function updateDraft(code: string, version: number, rawContent: unknown, notes?: string) {
  const content = await validateWorkflowContent(rawContent);
  const doc = await WorkflowDefinition.findOneAndUpdate(
    { code, version, status: 'DRAFT' },
    { $set: { content, ...(notes !== undefined ? { notes } : {}) } },
    { new: true },
  );
  if (!doc) throw conflict('Only draft versions can be edited. Create a new version instead.');
  await audit({ action: 'workflow.update_draft', entityType: 'WorkflowDefinition', entityId: `${code}@${version}` });
  return doc;
}

/** Makes a draft the active version; the previous active version is retired but stays in force for its cases. */
export async function activateVersion(code: string, version: number) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const target = await WorkflowDefinition.findOne({ code, version }).session(session);
      if (!target) throw notFound(`Workflow ${code} v${version} not found`);
      if (target.status !== 'DRAFT') throw conflict(`Version ${version} is already ${target.status.toLowerCase()}`);
      // Re-validate: roles referenced by the draft may have been removed since it was saved.
      await validateWorkflowContent(target.content);
      await WorkflowDefinition.updateMany({ code, status: 'ACTIVE' }, { $set: { status: 'RETIRED', retiredAt: new Date() } }, { session });
      target.status = 'ACTIVE';
      target.activatedAt = new Date();
      await target.save({ session });
    });
  } finally {
    await session.endSession();
  }
  await audit({ action: 'workflow.activate', entityType: 'WorkflowDefinition', entityId: `${code}@${version}` });
}
