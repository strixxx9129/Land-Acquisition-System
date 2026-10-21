import { Types } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { runAsSystem } from '../src/modules/access/context.js';
import { Case } from '../src/modules/cases/case.model.js';
import { CaseEvent } from '../src/modules/cases/caseEvent.model.js';
import { asUser, login } from './helpers.js';

type Client = ReturnType<typeof asUser>;
let nhai: Client, laoPune: Client, collectorPune: Client, collectorNashik: Client, stateMh: Client, admin: Client;

beforeAll(async () => {
  const as = async (u: string) => asUser((await login(`${u}@demo.lams.test`)).token);
  nhai = await as('rb.nhai');
  laoPune = await as('lao.pune');
  collectorPune = await as('collector.pune');
  collectorNashik = await as('collector.nashik');
  stateMh = await as('state.mh');
  admin = await as('admin');
});

const proposal = (overrides: Record<string, unknown> = {}) => ({
  title: 'Test bypass for Talegaon',
  projectType: 'HIGHWAY',
  publicPurpose: 'INFRASTRUCTURE',
  purpose: 'Bypass to decongest the town centre (test case).',
  areaProposedHa: 12.5,
  villages: ['Talegaon'],
  workflowCode: 'NH_ACT_1956',
  districtCode: '2701',
  ...overrides,
});

async function newCase(overrides: Record<string, unknown> = {}) {
  const res = await nhai.post('/api/cases', proposal(overrides));
  expect(res.status).toBe(201);
  return res.body as { id: string; version: number; stage: { code: string }; caseNumber: string };
}

async function act(client: Client, id: string, action: string, extra: Record<string, unknown> = {}) {
  const current = await client.get(`/api/cases/${id}`);
  return client.post(`/api/cases/${id}/transitions`, { action, expectedVersion: current.body.version, ...extra });
}

const today = () => new Date().toISOString().slice(0, 10);

describe('creating proposals', () => {
  it('opens a draft in the initial stage of the active workflow, with a case number and a creation event', async () => {
    const res = await nhai.post('/api/cases', proposal());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'ACTIVE', stage: { code: 'DRAFT' }, workflowCode: 'NH_ACT_1956', version: 0, organization: { code: 'NHAI' } });
    expect(res.body.caseNumber).toMatch(/^LA-2701-\d{4}-\d{4}$/);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].action).toBe('CASE_CREATED');
    expect(res.body.availableActions.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['SUBMIT', 'WITHDRAW']));
  });

  it('always files a requiring body\'s proposal under its own organisation', async () => {
    const res = await nhai.post('/api/cases', proposal({ organizationCode: 'MIDC' }));
    expect(res.status).toBe(201);
    expect(res.body.organization.code).toBe('NHAI');
  });

  it('refuses roles without case.create', async () => {
    expect((await collectorPune.post('/api/cases', proposal())).status).toBe(403);
  });

  it('refuses a framework that does not apply to the project type', async () => {
    const res = await nhai.post('/api/cases', proposal({ projectType: 'RAILWAY' }));
    expect(res.status).toBe(400);
  });

  it('validates the proposal', async () => {
    const res = await nhai.post('/api/cases', proposal({ areaProposedHa: -3, title: 'x' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('moving a case through the workflow', () => {
  it('runs submit → scrutiny → 3A notification, with officer inboxes and recorded inputs', async () => {
    const c = await newCase();
    expect((await act(nhai, c.id, 'SUBMIT')).body.stage.code).toBe('CALA_SCRUTINY');

    const inbox = await laoPune.get('/api/cases/inbox');
    expect(inbox.body.items.map((i: { id: string }) => i.id)).toContain(c.id);

    expect((await act(laoPune, c.id, 'FORWARD_FOR_3A')).body.stage.code).toBe('NOTIFICATION_3A_PENDING');
    const published = await act(laoPune, c.id, 'PUBLISH_3A', { inputs: { gazetteNumber: 'S.O. 1234(E)', notificationDate: today() } });
    expect(published.status).toBe(200);
    expect(published.body.stage.code).toBe('OBJECTIONS_3C');
    expect(published.body.recorded.gazetteNumber).toBe('S.O. 1234(E)');
    const objection = published.body.deadlines.find((d: { code: string }) => d.code === 'OBJECTION_PERIOD_3C');
    expect(objection.status).toMatch(/ON_TRACK|DUE_SOON/);
    expect(objection.daysRemaining).toBe(21);
    expect(published.body.events.map((e: { action: string }) => e.action)).toEqual(['CASE_CREATED', 'SUBMIT', 'FORWARD_FOR_3A', 'PUBLISH_3A']);
  });

  it('rejects an action the user\'s role may not take', async () => {
    const c = await newCase();
    await act(nhai, c.id, 'SUBMIT');
    const res = await act(nhai, c.id, 'FORWARD_FOR_3A');
    expect(res.status).toBe(403);
  });

  it('rejects an action that does not exist from the current stage', async () => {
    const c = await newCase();
    const res = await act(nhai, c.id, 'PUBLISH_3D');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.details.allowed).toContain('SUBMIT');
  });

  it('requires the configured inputs and rejects official dates in the future', async () => {
    const c = await newCase();
    await act(nhai, c.id, 'SUBMIT');
    await act(laoPune, c.id, 'FORWARD_FOR_3A');
    expect((await act(laoPune, c.id, 'PUBLISH_3A', { inputs: {} })).status).toBe(400);
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const res = await act(laoPune, c.id, 'PUBLISH_3A', { inputs: { gazetteNumber: 'S.O. 1', notificationDate: future } });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/future/);
  });

  it('requires remarks where the workflow says so', async () => {
    const c = await newCase();
    await act(nhai, c.id, 'SUBMIT');
    const res = await act(laoPune, c.id, 'RETURN');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REMARKS_REQUIRED');
    const ok = await act(laoPune, c.id, 'RETURN', { remarks: 'Land schedule incomplete.' });
    expect(ok.body.stage.code).toBe('SENT_BACK');
  });

  it('lets only one of two simultaneous actions win; the other gets a conflict', async () => {
    const c = await newCase();
    await act(nhai, c.id, 'SUBMIT');
    const { version } = (await laoPune.get(`/api/cases/${c.id}`)).body;
    const [a, b] = await Promise.all([
      laoPune.post(`/api/cases/${c.id}/transitions`, { action: 'FORWARD_FOR_3A', expectedVersion: version }),
      laoPune.post(`/api/cases/${c.id}/transitions`, { action: 'RETURN', expectedVersion: version, remarks: 'Missing maps' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const events = await runAsSystem('test', () => CaseEvent.countDocuments({ caseId: c.id }));
    expect(events).toBe(3);
  });

  it('rejects an action based on an outdated view of the case', async () => {
    const c = await newCase();
    const stale = c.version;
    await act(nhai, c.id, 'SUBMIT');
    const res = await nhai.post(`/api/cases/${c.id}/transitions`, { action: 'WITHDRAW', expectedVersion: stale, remarks: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STALE_VERSION');
  });

  it('closes the case at a terminal stage and allows nothing further', async () => {
    const c = await newCase();
    const res = await act(nhai, c.id, 'WITHDRAW', { remarks: 'Alignment changed.' });
    expect(res.body.status).toBe('WITHDRAWN');
    expect(res.body.availableActions).toEqual([]);
    expect((await act(nhai, c.id, 'SUBMIT')).status).toBe(409);
  });
});

describe('editing proposals', () => {
  it('allows edits while the stage permits, and records them in history', async () => {
    const c = await newCase();
    const res = await nhai.patch(`/api/cases/${c.id}`, { areaProposedHa: 14.2, expectedVersion: c.version });
    expect(res.status).toBe(200);
    expect(res.body.areaProposedHa).toBe(14.2);
    expect(res.body.events.at(-1)).toMatchObject({ action: 'PROPOSAL_UPDATED', inputs: { changedFields: ['areaProposedHa'] } });
  });

  it('blocks edits once the proposal has moved on', async () => {
    const c = await newCase();
    const submitted = await act(nhai, c.id, 'SUBMIT');
    const res = await nhai.patch(`/api/cases/${c.id}`, { areaProposedHa: 99, expectedVersion: submitted.body.version });
    expect(res.status).toBe(409);
  });
});

describe('jurisdiction isolation on cases', () => {
  it('hides another district\'s case, even by direct id', async () => {
    const c = await newCase();
    expect((await collectorNashik.get(`/api/cases/${c.id}`)).status).toBe(404);
    expect((await collectorNashik.post(`/api/cases/${c.id}/transitions`, { action: 'SUBMIT', expectedVersion: 0 })).status).toBe(404);
    const list = await collectorNashik.get('/api/cases?pageSize=100');
    expect(list.body.items.every((i: { district: { code: string } }) => i.district.code === '2702')).toBe(true);
  });

  it('shows a state officer every district of the state', async () => {
    const list = await stateMh.get('/api/cases?pageSize=100');
    const districts = new Set(list.body.items.map((i: { district: { code: string } }) => i.district.code));
    expect(districts).toEqual(new Set(['2701', '2702']));
  });

  it('shows a requiring body only its own organisation\'s cases', async () => {
    const list = await nhai.get('/api/cases?pageSize=100');
    expect(list.body.items.every((i: { organization: { code: string } }) => i.organization.code === 'NHAI')).toBe(true);
  });
});

describe('history is append-only and tamper-evident', () => {
  it('verifies an untouched history', async () => {
    const c = await newCase();
    await act(nhai, c.id, 'SUBMIT');
    expect((await nhai.get(`/api/cases/${c.id}/integrity`)).body).toEqual({ intact: true, events: 2 });
  });

  it('refuses to update or delete events through the application', async () => {
    const c = await newCase();
    await expect(runAsSystem('test', () => CaseEvent.updateOne({ caseId: c.id }, { $set: { remarks: 'edited' } }))).rejects.toThrow(/cannot be changed/);
    await expect(runAsSystem('test', () => CaseEvent.deleteMany({ caseId: c.id }))).rejects.toThrow(/cannot be changed/);
  });

  it('detects an event altered directly in the database', async () => {
    const c = await newCase();
    await act(nhai, c.id, 'SUBMIT');
    await CaseEvent.collection.updateOne({ caseId: new Types.ObjectId(c.id), seq: 2 }, { $set: { remarks: 'quietly edited' } });
    const res = await nhai.get(`/api/cases/${c.id}/integrity`);
    expect(res.body).toMatchObject({ intact: false, brokenAt: 2 });
  });
});

describe('seeded demo cases', () => {
  it('put an overdue scrutiny in the Pune LAO\'s inbox', async () => {
    const inbox = (await laoPune.get('/api/cases/inbox')).body.items as { title: string; sla: { overdue: boolean } }[];
    const chakan = inbox.find((i) => i.title.startsWith('Chakan'));
    expect(chakan?.sla.overdue).toBe(true);
  });

  it('show a declaration deadline that is due soon to the Maharashtra state officer', async () => {
    const inbox = (await stateMh.get('/api/cases/inbox')).body.items as { title: string; nextDeadline: { code: string; status: string } }[];
    const rail = inbox.find((i) => i.title.startsWith('Pune–Nashik'));
    expect(rail?.nextDeadline).toMatchObject({ code: 'DECLARATION', status: 'DUE_SOON' });
  });

  it('all have intact histories', async () => {
    const ids = await runAsSystem('test', async () => (await Case.find({ seedKey: { $exists: true } }).select('_id').lean()).map((c) => String(c._id)));
    expect(ids.length).toBe(8);
    for (const id of ids) expect((await admin.get(`/api/cases/${id}/integrity`)).body.intact).toBe(true);
  });
});

describe('workflows are configuration with versions', () => {
  it('rejects an inconsistent definition with a list of problems', async () => {
    const current = (await admin.get('/api/workflows/NH_ACT_1956/versions/1')).body.content;
    const broken = structuredClone(current);
    broken.transitions[0].to = 'NOWHERE';
    const res = await admin.post('/api/workflows/NH_ACT_1956/versions', { content: broken });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WORKFLOW_INVALID');
    expect(res.body.error.details.some((d: { message: string }) => d.message.includes('NOWHERE'))).toBe(true);
  });

  it('forbids non-admins from changing workflows', async () => {
    const res = await collectorPune.post('/api/workflows/NH_ACT_1956/versions', { content: {} });
    expect(res.status).toBe(403);
  });

  it('applies a new active version to new cases only; existing cases keep the version they started on', async () => {
    const before = await newCase();
    expect((await nhai.get(`/api/cases/${before.id}`)).body.workflowVersion).toBe(1);

    const content = structuredClone((await admin.get('/api/workflows/NH_ACT_1956/versions/1')).body.content);
    content.stages.find((s: { code: string }) => s.code === 'CALA_SCRUTINY').slaDays = 7;
    const draft = await admin.post('/api/workflows/NH_ACT_1956/versions', { content, notes: 'Tighter scrutiny SLA' });
    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({ version: 2, status: 'DRAFT' });

    // Drafts don't affect anyone until activated.
    expect((await newCase()).id).toBeTruthy();
    expect((await admin.post('/api/workflows/NH_ACT_1956/versions/2/activate')).status).toBe(200);

    const after = await nhai.get(`/api/cases/${(await newCase()).id}`);
    expect(after.body.workflowVersion).toBe(2);
    expect(after.body.workflow.stages.find((s: { code: string }) => s.code === 'CALA_SCRUTINY').slaDays).toBe(7);
    expect((await nhai.get(`/api/cases/${before.id}`)).body.workflowVersion).toBe(1);

    const list = (await admin.get('/api/workflows')).body.items.find((w: { code: string }) => w.code === 'NH_ACT_1956');
    expect(list.versions.map((v: { version: number; status: string }) => `${v.version}:${v.status}`)).toEqual(['2:ACTIVE', '1:RETIRED']);
    // Activated versions are frozen.
    expect((await admin.put('/api/workflows/NH_ACT_1956/versions/2', { content })).status).toBe(409);
  });
});
