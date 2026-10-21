import mongoose, { Types, type ClientSession } from 'mongoose';
import type { z } from 'zod';
import {
  inputsSchema,
  transitionsFor,
  type CaseStatus,
  type createCaseSchema,
  type transitionRequestSchema,
  type updateProposalSchema,
  type WorkflowContent,
  type WorkflowTransition,
} from '@lams/shared';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { Jurisdiction } from '../masters/jurisdiction.model.js';
import { Organization } from '../masters/organization.model.js';
import { getActiveWorkflow, getWorkflow } from '../workflow/workflow.service.js';
import { Case } from './case.model.js';
import { CaseEvent, eventHash } from './caseEvent.model.js';
import { nextSequence } from './counter.model.js';

/** Who is acting, as recorded in history. Seeds pass real (synthetic) officers here too. */
export interface ActingUser {
  userId: string;
  name: string;
  roleCode: string;
  organizationCode?: string;
  permissions: ReadonlySet<string>;
}

type CreateCase = z.output<typeof createCaseSchema>;
type TransitionRequest = z.output<typeof transitionRequestSchema>;
type UpdateProposal = z.output<typeof updateProposalSchema>;

async function inTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    // withTransaction retries on transient write conflicts; fn re-reads everything, so it is safe to repeat.
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

const startOfUtcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

interface EventDraft {
  action: string;
  fromStage?: string;
  toStage?: string;
  remarks?: string;
  inputs?: Record<string, unknown>;
  effectiveDate?: Date;
}

function buildEvent(
  c: { _id: Types.ObjectId; eventCount: number; lastEventHash?: string | null; workflowCode: string; workflowVersion: number; stateCode: string; districtCode: string; organizationCode: string },
  by: ActingUser,
  at: Date,
  draft: EventDraft,
) {
  const event = {
    caseId: c._id,
    seq: c.eventCount + 1,
    at,
    actor: { userId: new Types.ObjectId(by.userId), name: by.name, roleCode: by.roleCode },
    ...draft,
    workflowCode: c.workflowCode,
    workflowVersion: c.workflowVersion,
    stateCode: c.stateCode,
    districtCode: c.districtCode,
    organizationCode: c.organizationCode,
    prevHash: c.lastEventHash ?? '',
  };
  return { ...event, hash: eventHash(event) };
}

export function availableActions(wf: WorkflowContent, c: { status: string; currentStage: string }, by: ActingUser): WorkflowTransition[] {
  if (c.status !== 'ACTIVE' || !by.permissions.has('case.transition')) return [];
  return transitionsFor(wf, c.currentStage, by.roleCode);
}

/** Opens a case in the initial stage of the framework's active workflow version. */
export async function createCase(input: CreateCase, by: ActingUser, at = new Date()) {
  const wf = await getActiveWorkflow(input.workflowCode);
  if (wf.content.applicableProjectTypes.length && !wf.content.applicableProjectTypes.includes(input.projectType)) {
    throw badRequest(`${input.workflowCode} does not apply to ${input.projectType} projects`);
  }
  const district = await Jurisdiction.findOne({ code: input.districtCode, level: 'DISTRICT' }).lean();
  if (!district) throw badRequest('Unknown district');
  const organizationCode = by.organizationCode ?? input.organizationCode;
  if (!organizationCode) throw badRequest('organizationCode is required');
  if (!(await Organization.exists({ code: organizationCode }))) throw badRequest('Unknown organisation');

  const { workflowCode: _w, districtCode: _d, organizationCode: _o, ...proposal } = input;
  return inTransaction(async (session) => {
    const year = at.getUTCFullYear();
    const seq = await nextSequence(`case:${district.code}:${year}`, session);
    const base = {
      _id: new Types.ObjectId(),
      eventCount: 0,
      lastEventHash: '',
      workflowCode: wf.code,
      workflowVersion: wf.version,
      stateCode: district.stateCode,
      districtCode: district.code,
      organizationCode,
    };
    const event = buildEvent(base, by, at, { action: 'CASE_CREATED', toStage: wf.content.initialStage });
    // The scope plugin rejects this save if the case lies outside the creator's jurisdiction.
    const [created] = await Case.create(
      [
        {
          ...base,
          ...proposal,
          caseNumber: `LA-${district.code}-${year}-${String(seq).padStart(4, '0')}`,
          currentStage: wf.content.initialStage,
          status: 'ACTIVE',
          stageEnteredAt: at,
          stageDates: { [wf.content.initialStage]: at },
          version: 0,
          eventCount: 1,
          lastEventHash: event.hash,
          lastActionAt: at,
          createdBy: by.userId,
        },
      ],
      { session },
    );
    await CaseEvent.create([event], { session });
    return created!;
  });
}

/** Moves a case along one workflow transition, atomically with its history entry. */
export async function transitionCase(caseId: string, req: TransitionRequest, by: ActingUser, at = new Date()) {
  return inTransaction(async (session) => {
    const c = await Case.findById(caseId).session(session);
    if (!c) throw notFound('Case not found');
    if (c.version !== req.expectedVersion) {
      throw new AppError(409, 'STALE_VERSION', 'This case was updated by someone else. Reload to see the latest state.', {
        currentVersion: c.version,
        currentStage: c.currentStage,
      });
    }
    if (c.status !== 'ACTIVE') throw conflict(`This case is closed (${c.status.toLowerCase()})`);
    const wf = (await getWorkflow(c.workflowCode, c.workflowVersion)).content;

    const transition = wf.transitions.find((t) => t.action === req.action && t.from.includes(c.currentStage));
    if (!transition) {
      throw new AppError(409, 'INVALID_TRANSITION', `"${req.action}" is not possible from stage ${c.currentStage}`, {
        allowed: wf.transitions.filter((t) => t.from.includes(c.currentStage)).map((t) => t.action),
      });
    }
    if (!by.permissions.has('case.transition') || !transition.roles.includes(by.roleCode)) {
      throw forbidden('Your role cannot take this action at this stage');
    }
    if (transition.requiresRemarks && !req.remarks) throw new AppError(400, 'REMARKS_REQUIRED', 'Remarks are required for this action');
    const inputs = inputsSchema(transition.inputs).parse(req.inputs) as Record<string, unknown>;

    let effectiveDate: Date | undefined;
    if (transition.effectiveDateInput) {
      effectiveDate = new Date(`${inputs[transition.effectiveDateInput] as string}T00:00:00.000Z`);
      if (effectiveDate.getTime() > startOfUtcDay(at)) throw badRequest('The official date cannot be in the future');
      if (effectiveDate.getTime() < startOfUtcDay(c.stageEnteredAt)) throw badRequest('The official date cannot be before the case reached its current stage');
    }

    const target = wf.stages.find((s) => s.code === transition.to)!;
    const status: CaseStatus = target.terminal ? (target.outcome as CaseStatus) : 'ACTIVE';
    const enteredAt = effectiveDate ?? at;
    const event = buildEvent(c, by, at, {
      action: transition.action,
      fromStage: c.currentStage,
      toStage: target.code,
      remarks: req.remarks || undefined,
      inputs: Object.keys(inputs).length ? inputs : undefined,
      effectiveDate,
    });

    const set: Record<string, unknown> = {
      currentStage: target.code,
      status,
      stageEnteredAt: enteredAt,
      lastActionAt: at,
      lastEventHash: event.hash,
    };
    // Deadlines run from the first time a stage was reached, unless an official date is recorded.
    if (effectiveDate || !c.stageDates?.get(target.code)) set[`stageDates.${target.code}`] = enteredAt;
    for (const [k, v] of Object.entries(inputs)) set[`recorded.${k}`] = v;

    const updated = await Case.findOneAndUpdate(
      { _id: c._id, version: c.version, currentStage: c.currentStage },
      { $set: set, $inc: { version: 1, eventCount: 1 } },
      { new: true, session },
    );
    if (!updated) throw new AppError(409, 'STALE_VERSION', 'This case was updated by someone else. Reload to see the latest state.');
    await CaseEvent.create([event], { session });
    return updated;
  });
}

/** Edits proposal details while the stage allows it (e.g. a draft or a proposal sent back). */
export async function updateProposal(caseId: string, changes: UpdateProposal, by: ActingUser, at = new Date()) {
  const { expectedVersion, ...fields } = changes;
  if (Object.keys(fields).length === 0) throw badRequest('Nothing to update');
  return inTransaction(async (session) => {
    const c = await Case.findById(caseId).session(session);
    if (!c) throw notFound('Case not found');
    if (c.version !== expectedVersion) throw new AppError(409, 'STALE_VERSION', 'This case was updated by someone else. Reload to see the latest state.');
    const wf = (await getWorkflow(c.workflowCode, c.workflowVersion)).content;
    const stage = wf.stages.find((s) => s.code === c.currentStage);
    if (c.status !== 'ACTIVE' || !stage?.allowEdit) throw conflict('The proposal can no longer be edited at this stage');
    if (!stage.actorRoles.includes(by.roleCode)) throw forbidden('Your role cannot edit this proposal');

    const event = buildEvent(c, by, at, { action: 'PROPOSAL_UPDATED', inputs: { changedFields: Object.keys(fields).sort() } });
    const updated = await Case.findOneAndUpdate(
      { _id: c._id, version: c.version },
      { $set: { ...fields, lastActionAt: at, lastEventHash: event.hash }, $inc: { version: 1, eventCount: 1 } },
      { new: true, session },
    );
    if (!updated) throw new AppError(409, 'STALE_VERSION', 'This case was updated by someone else.');
    await CaseEvent.create([event], { session });
    return updated;
  });
}

/** Recomputes the hash chain. Any edited, removed or reordered event shows up as a break. */
export async function verifyHistory(caseId: string) {
  const c = await Case.findById(caseId).select('eventCount lastEventHash').lean();
  if (!c) throw notFound('Case not found');
  const events = await CaseEvent.find({ caseId }).sort({ seq: 1 }).lean();
  let prev = '';
  for (const [i, e] of events.entries()) {
    if (e.seq !== i + 1) return { intact: false, events: events.length, brokenAt: i + 1, reason: 'missing event' };
    if (e.prevHash !== prev || eventHash(e) !== e.hash) return { intact: false, events: events.length, brokenAt: e.seq, reason: 'hash mismatch' };
    prev = e.hash;
  }
  if (events.length !== c.eventCount || prev !== (c.lastEventHash ?? '')) {
    return { intact: false, events: events.length, brokenAt: events.length, reason: 'history does not match the case' };
  }
  return { intact: true, events: events.length };
}
