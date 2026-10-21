import { Router } from 'express';
import { z } from 'zod';
import { CASE_STATUSES, createCaseSchema, PROJECT_TYPES, PUBLIC_PURPOSES, transitionRequestSchema, updateProposalSchema, type LocalizedText } from '@lams/shared';
import { notFound } from '../../lib/errors.js';
import { currentUserActor } from '../access/context.js';
import { requirePermission } from '../auth/auth.middleware.js';
import { Jurisdiction } from '../masters/jurisdiction.model.js';
import { masterLabels } from '../masters/labels.service.js';
import { Organization } from '../masters/organization.model.js';
import { listActiveWorkflows } from '../workflow/workflow.service.js';
import { Case, type CaseDoc } from './case.model.js';
import { actingUserFromRequest, inbox, presentDetail, presentSummary } from './cases.service.js';
import { createCase, transitionCase, updateProposal, verifyHistory } from './engine.js';

const idParam = z.string().regex(/^[a-f0-9]{24}$/, 'invalid case id');
const listQuery = z.object({
  status: z.enum(CASE_STATUSES).optional(),
  stage: z.string().max(60).optional(),
  workflowCode: z.string().max(60).optional(),
  districtCode: z.string().max(20).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type CaseRecord = CaseDoc & { _id: unknown };

export const casesRouter = Router();
casesRouter.use(requirePermission('case.read'));

casesRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.stage) filter.currentStage = q.stage;
  if (q.workflowCode) filter.workflowCode = q.workflowCode;
  if (q.districtCode) filter.districtCode = q.districtCode;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ title: rx }, { caseNumber: rx }];
  }
  const [items, total] = await Promise.all([
    Case.find(filter).sort({ lastActionAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean<CaseRecord[]>(),
    Case.countDocuments(filter),
  ]);
  const labels = await masterLabels();
  res.json({ items: await Promise.all(items.map((c) => presentSummary(c, undefined, labels))), total, page: q.page, pageSize: q.pageSize });
});

casesRouter.get('/inbox', async (req, res) => {
  res.json({ items: await inbox(actingUserFromRequest(req.principal!)) });
});

/** Choices for the proposal form, limited to what the user may create. */
casesRouter.get('/meta/options', async (_req, res) => {
  const actor = currentUserActor();
  const districtFilter: Record<string, unknown> = { level: 'DISTRICT' };
  if (actor.scope.level === 'STATE') districtFilter.stateCode = actor.scope.stateCode;
  if (actor.scope.level === 'DISTRICT') districtFilter.code = actor.scope.districtCode;
  const [workflows, districts, organizations, labels] = await Promise.all([
    listActiveWorkflows(),
    Jurisdiction.find(districtFilter).select('code name stateCode').sort({ stateCode: 1, code: 1 }).lean(),
    actor.scope.level === 'ORGANIZATION' ? Organization.find({ code: actor.scope.organizationCode }).lean() : Organization.find().sort({ code: 1 }).lean(),
    masterLabels(),
  ]);
  res.json({
    workflows: workflows.map((w) => ({ code: w.code, version: w.version, name: w.content.name, legalFramework: w.content.legalFramework, applicableProjectTypes: w.content.applicableProjectTypes })),
    districts: districts.map((d) => ({ code: d.code, name: d.name, stateCode: d.stateCode, stateName: labels.get(`J:${d.stateCode}`) as LocalizedText | undefined })),
    organizations: organizations.map((o) => ({ code: o.code, name: o.name })),
    projectTypes: PROJECT_TYPES,
    publicPurposes: PUBLIC_PURPOSES,
    fixedOrganization: actor.scope.level === 'ORGANIZATION' ? actor.scope.organizationCode : null,
  });
});

casesRouter.post('/', requirePermission('case.create'), async (req, res) => {
  const input = createCaseSchema.parse(req.body);
  const by = actingUserFromRequest(req.principal!);
  const created = await createCase(input, by);
  res.status(201).json(await presentDetail(created.toObject() as CaseRecord, by));
});

casesRouter.get('/:id', async (req, res) => {
  const c = await Case.findById(idParam.parse(req.params.id)).lean<CaseRecord>();
  // Out-of-scope cases are indistinguishable from missing ones.
  if (!c) throw notFound('Case not found');
  res.json(await presentDetail(c, actingUserFromRequest(req.principal!)));
});

casesRouter.patch('/:id', async (req, res) => {
  const by = actingUserFromRequest(req.principal!);
  const updated = await updateProposal(idParam.parse(req.params.id), updateProposalSchema.parse(req.body), by);
  res.json(await presentDetail(updated.toObject() as CaseRecord, by));
});

casesRouter.post('/:id/transitions', requirePermission('case.transition'), async (req, res) => {
  const by = actingUserFromRequest(req.principal!);
  const updated = await transitionCase(idParam.parse(req.params.id), transitionRequestSchema.parse(req.body), by);
  res.json(await presentDetail(updated.toObject() as CaseRecord, by));
});

casesRouter.get('/:id/integrity', async (req, res) => {
  res.json(await verifyHistory(idParam.parse(req.params.id)));
});
