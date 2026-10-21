import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { requirePermission } from '../auth/auth.middleware.js';
import { WorkflowDefinition } from './workflowDefinition.model.js';
import { activateVersion, createWorkflowVersion, getWorkflow, updateDraft, validateWorkflowContent } from './workflow.service.js';

const codeParam = z.string().regex(/^[A-Z][A-Z0-9_]{1,59}$/);
const versionParam = z.coerce.number().int().positive();
const saveBody = z.object({ content: z.unknown(), notes: z.string().max(2000).optional() });

export const workflowRouter = Router();

/** Every workflow with its versions. Readable by anyone who works on cases (the UI needs stage names). */
workflowRouter.get('/', requirePermission('case.read'), async (_req, res) => {
  const docs = await WorkflowDefinition.find().select('code version status notes activatedAt updatedAt content.name content.legalFramework content.applicableProjectTypes').sort({ code: 1, version: -1 }).lean();
  const byCode = new Map<string, { code: string; name?: unknown; legalFramework?: unknown; applicableProjectTypes?: unknown; versions: unknown[] }>();
  for (const d of docs) {
    const entry = byCode.get(d.code) ?? { code: d.code, versions: [] };
    const content = d.content as { name?: unknown; legalFramework?: unknown; applicableProjectTypes?: unknown };
    if (d.status === 'ACTIVE' || !entry.name) Object.assign(entry, { name: content.name, legalFramework: content.legalFramework, applicableProjectTypes: content.applicableProjectTypes });
    entry.versions.push({ version: d.version, status: d.status, notes: d.notes, activatedAt: d.activatedAt, updatedAt: d.updatedAt });
    byCode.set(d.code, entry);
  }
  res.json({ items: [...byCode.values()] });
});

workflowRouter.get('/:code/versions/:version', requirePermission('case.read'), async (req, res) => {
  const wf = await getWorkflow(codeParam.parse(req.params.code), versionParam.parse(req.params.version));
  const meta = await WorkflowDefinition.findOne({ code: wf.code, version: wf.version }).select('notes activatedAt retiredAt updatedAt').lean();
  if (!meta) throw notFound();
  res.json({ ...wf, notes: meta.notes, activatedAt: meta.activatedAt, retiredAt: meta.retiredAt, updatedAt: meta.updatedAt });
});

const admin = Router();
admin.use(requirePermission('workflow.config.manage'));

/** Dry-run validation for the editor. */
admin.post('/validate', async (req, res) => {
  await validateWorkflowContent(z.object({ content: z.unknown() }).parse(req.body).content);
  res.json({ valid: true });
});

/** New workflow (version 1) or the next version of an existing one, saved as a draft. */
admin.post('/:code/versions', async (req, res) => {
  const { content, notes } = saveBody.parse(req.body);
  const doc = await createWorkflowVersion(codeParam.parse(req.params.code), content, notes);
  res.status(201).json({ code: doc.code, version: doc.version, status: doc.status });
});

admin.put('/:code/versions/:version', async (req, res) => {
  const { content, notes } = saveBody.parse(req.body);
  const doc = await updateDraft(codeParam.parse(req.params.code), versionParam.parse(req.params.version), content, notes);
  res.json({ code: doc.code, version: doc.version, status: doc.status });
});

admin.post('/:code/versions/:version/activate', async (req, res) => {
  const code = codeParam.parse(req.params.code);
  const version = versionParam.parse(req.params.version);
  await activateVersion(code, version);
  res.json({ code, version, status: 'ACTIVE' });
});

workflowRouter.use(admin);
