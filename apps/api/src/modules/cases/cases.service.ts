import { evaluateDeadlines, evaluateSla, mainPathStages, transitionsFor, type LocalizedText, type WorkflowContent } from '@lams/shared';
import { currentUserActor } from '../access/context.js';
import { masterLabels } from '../masters/labels.service.js';
import { getWorkflow } from '../workflow/workflow.service.js';
import { Case, type CaseDoc } from './case.model.js';
import { CaseEvent } from './caseEvent.model.js';
import { availableActions, type ActingUser } from './engine.js';

type CaseRecord = CaseDoc & { _id: unknown; createdAt?: Date; updatedAt?: Date };

const wfOf = async (c: { workflowCode: string; workflowVersion: number }) => (await getWorkflow(c.workflowCode, c.workflowVersion)).content;

function stageDatesOf(c: CaseRecord): Record<string, Date> {
  const raw = c.stageDates as unknown;
  if (raw instanceof Map) return Object.fromEntries(raw);
  return (raw ?? {}) as Record<string, Date>;
}

/** The compact shape used by lists and the inbox. */
export async function presentSummary(c: CaseRecord, wf?: WorkflowContent, labels?: Map<string, LocalizedText>) {
  wf ??= await wfOf(c);
  labels ??= await masterLabels();
  const stage = wf.stages.find((s) => s.code === c.currentStage);
  const deadlines = evaluateDeadlines(wf, stageDatesOf(c), c.status === 'ACTIVE');
  return {
    id: String(c._id),
    caseNumber: c.caseNumber,
    title: c.title,
    projectType: c.projectType,
    areaProposedHa: c.areaProposedHa,
    status: c.status,
    workflowCode: c.workflowCode,
    workflowVersion: c.workflowVersion,
    workflowName: wf.name,
    stage: { code: c.currentStage, name: stage?.name ?? { en: c.currentStage }, phase: stage?.phase },
    stageEnteredAt: c.stageEnteredAt,
    sla: c.status === 'ACTIVE' ? evaluateSla(stage, c.stageEnteredAt) : null,
    // The most pressing open statutory deadline, for list badges.
    nextDeadline: deadlines.filter((d) => ['BREACHED', 'DUE_SOON', 'ON_TRACK'].includes(d.status)).sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0))[0] ?? null,
    state: { code: c.stateCode, name: labels.get(`J:${c.stateCode}`) },
    district: { code: c.districtCode, name: labels.get(`J:${c.districtCode}`) },
    organization: { code: c.organizationCode, name: labels.get(`O:${c.organizationCode}`) },
    version: c.version,
    updatedAt: c.updatedAt,
  };
}

export async function presentDetail(c: CaseRecord, by: ActingUser) {
  const wf = await wfOf(c);
  const labels = await masterLabels();
  const events = await CaseEvent.find({ caseId: c._id }).sort({ seq: 1 }).lean();
  const stageName = (code?: string | null) => (code ? (wf.stages.find((s) => s.code === code)?.name ?? { en: code }) : undefined);
  const current = wf.stages.find((s) => s.code === c.currentStage);
  return {
    ...(await presentSummary(c, wf, labels)),
    proposal: {
      publicPurpose: c.publicPurpose,
      purpose: c.purpose,
      estimatedCostCr: c.estimatedCostCr,
      affectedFamiliesEstimate: c.affectedFamiliesEstimate,
      villages: c.villages,
      urgency: c.urgency,
    },
    canEdit: c.status === 'ACTIVE' && !!current?.allowEdit && current.actorRoles.includes(by.roleCode),
    recorded: c.recorded ?? {},
    stageDates: stageDatesOf(c),
    workflow: {
      code: c.workflowCode,
      version: c.workflowVersion,
      name: wf.name,
      legalFramework: wf.legalFramework,
      legalReference: wf.legalReference,
      stages: wf.stages.map((s) => ({ code: s.code, name: s.name, phase: s.phase, terminal: s.terminal, outcome: s.outcome, slaDays: s.slaDays, actorRoles: s.actorRoles })),
      mainPath: mainPathStages(wf),
    },
    currentStageInfo: current
      ? { description: current.description, requiredDocuments: current.requiredDocuments, actorRoles: current.actorRoles }
      : null,
    deadlines: evaluateDeadlines(wf, stageDatesOf(c), c.status === 'ACTIVE'),
    availableActions: availableActions(wf, c, by).map((t) => ({
      action: t.action,
      label: t.label,
      kind: t.kind,
      to: { code: t.to, name: stageName(t.to) },
      requiresRemarks: t.requiresRemarks,
      inputs: t.inputs,
    })),
    events: events.map((e) => ({
      seq: e.seq,
      at: e.at,
      action: e.action,
      actionLabel: wf.transitions.find((t) => t.action === e.action)?.label,
      actor: e.actor,
      fromStage: e.fromStage ? { code: e.fromStage, name: stageName(e.fromStage) } : null,
      toStage: e.toStage ? { code: e.toStage, name: stageName(e.toStage) } : null,
      remarks: e.remarks,
      inputs: e.inputs,
      effectiveDate: e.effectiveDate,
      hash: e.hash,
    })),
  };
}

/** Cases waiting for the current user's role to act, oldest first. Jurisdiction scoping is automatic. */
export async function inbox(by: ActingUser) {
  if (!by.permissions.has('case.transition')) return [];
  const versions = await Case.aggregate<{ _id: { code: string; version: number } }>([
    { $match: { status: 'ACTIVE' } },
    { $group: { _id: { code: '$workflowCode', version: '$workflowVersion' } } },
  ]);
  const clauses = [];
  for (const { _id } of versions) {
    const wf = await wfOf({ workflowCode: _id.code, workflowVersion: _id.version });
    const stages = wf.stages.filter((s) => transitionsFor(wf, s.code, by.roleCode).length > 0).map((s) => s.code);
    if (stages.length) clauses.push({ workflowCode: _id.code, workflowVersion: _id.version, currentStage: { $in: stages } });
  }
  if (!clauses.length) return [];
  const cases = await Case.find({ status: 'ACTIVE', $or: clauses }).sort({ stageEnteredAt: 1 }).limit(200).lean<CaseRecord[]>();
  const labels = await masterLabels();
  return Promise.all(cases.map((c) => presentSummary(c, undefined, labels)));
}

export function actingUserFromRequest(principal: { user: { name: string }; actor: { userId: string; roleCode: string; scope: { level: string; organizationCode?: string } } }): ActingUser {
  const actor = currentUserActor();
  return {
    userId: actor.userId,
    name: principal.user.name,
    roleCode: actor.roleCode,
    organizationCode: actor.scope.level === 'ORGANIZATION' ? actor.scope.organizationCode : undefined,
    permissions: actor.permissions,
  };
}
