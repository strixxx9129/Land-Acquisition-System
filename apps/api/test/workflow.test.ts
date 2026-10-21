import { describe, expect, it } from 'vitest';
import { checkWorkflowConsistency, evaluateDeadlines, evaluateSla, workflowContentSchema, type WorkflowContent } from '@lams/shared';
import { nhActWorkflow } from '../src/seed/data/workflows/nhAct.js';
import { rfctlarrWorkflow } from '../src/seed/data/workflows/rfctlarr.js';
import { roleSeeds } from '../src/seed/data/roles.js';

const roles = new Set(roleSeeds.map((r) => r.code));
const parse = (raw: unknown) => workflowContentSchema.parse(raw);
const clone = <T>(x: T): T => structuredClone(x);
const DAY = 86_400_000;

describe('seeded workflow definitions', () => {
  it.each([
    ['RFCTLARR', rfctlarrWorkflow],
    ['NH Act', nhActWorkflow],
  ])('%s is valid and internally consistent', (_name, raw) => {
    expect(checkWorkflowConsistency(parse(raw), roles)).toEqual([]);
  });
});

describe('workflow consistency checks', () => {
  const base = () => clone(parse(nhActWorkflow)) as WorkflowContent;

  it('rejects a transition to a stage that does not exist', () => {
    const wf = base();
    wf.transitions[0]!.to = 'NOWHERE';
    expect(checkWorkflowConsistency(wf, roles).map((i) => i.message)).toContain('unknown stage NOWHERE');
  });

  it('rejects unknown roles', () => {
    const wf = base();
    wf.transitions[0]!.roles = ['CHIEF_WIZARD'];
    expect(checkWorkflowConsistency(wf, roles).some((i) => i.message === 'unknown role CHIEF_WIZARD')).toBe(true);
  });

  it('rejects stages nobody can reach', () => {
    const wf = base();
    wf.stages.push({ code: 'ORPHAN', name: { en: 'Orphan' }, phase: 'PROPOSAL', actorRoles: [], allowEdit: false, terminal: true, outcome: 'REJECTED', requiredDocuments: [] });
    expect(checkWorkflowConsistency(wf, roles).some((i) => i.message === 'stage ORPHAN cannot be reached')).toBe(true);
  });

  it('rejects dead-end stages', () => {
    const wf = base();
    wf.transitions = wf.transitions.filter((t) => !t.from.includes('OBJECTIONS_3C'));
    expect(checkWorkflowConsistency(wf, roles).some((i) => i.message === 'stage OBJECTIONS_3C has no way out')).toBe(true);
  });

  it('rejects the same action twice from one stage', () => {
    const wf = base();
    wf.transitions.push({ ...wf.transitions[0]! });
    expect(checkWorkflowConsistency(wf, roles).some((i) => i.message.startsWith('action SUBMIT defined twice'))).toBe(true);
  });

  it('rejects an effective-date input that is not a required date', () => {
    const wf = base();
    const publish = wf.transitions.find((t) => t.action === 'PUBLISH_3A')!;
    publish.effectiveDateInput = 'gazetteNumber';
    expect(checkWorkflowConsistency(wf, roles).some((i) => i.path.endsWith('effectiveDateInput'))).toBe(true);
  });

  it('requires exactly one of days / months on a deadline', () => {
    const raw = clone(nhActWorkflow) as { deadlines: Record<string, unknown>[] };
    raw.deadlines[0]!.months = 1;
    expect(workflowContentSchema.safeParse(raw).success).toBe(false);
  });
});

describe('statutory deadline evaluation', () => {
  const wf = parse(rfctlarrWorkflow);
  const now = new Date('2026-10-21T00:00:00Z');
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const status = (dates: Record<string, Date>, code: string, open = true) => evaluateDeadlines(wf, dates, open, now).find((d) => d.code === code)!;

  it('is NOT_STARTED before its start stage is reached', () => {
    expect(status({ DRAFT: ago(10) }, 'DECLARATION').status).toBe('NOT_STARTED');
  });

  it('is ON_TRACK well before the due date', () => {
    expect(status({ OBJECTIONS: ago(30) }, 'DECLARATION')).toMatchObject({ status: 'ON_TRACK' });
  });

  it('is DUE_SOON inside the warning window (12-month declaration, 45-day warning)', () => {
    const d = status({ OBJECTIONS: ago(340) }, 'DECLARATION');
    expect(d.status).toBe('DUE_SOON');
    expect(d.daysRemaining).toBeGreaterThan(0);
    expect(d.daysRemaining).toBeLessThanOrEqual(45);
  });

  it('is BREACHED once past due with the end stage not reached', () => {
    const d = status({ COMPENSATION: ago(130) }, 'COMPENSATION_PAYMENT');
    expect(d.status).toBe('BREACHED');
    expect(d.daysRemaining).toBeLessThan(0);
  });

  it('is MET when the end stage was reached in time, MET_LATE when after', () => {
    expect(status({ COMPENSATION: ago(100), RR_IMPLEMENTATION: ago(50) }, 'COMPENSATION_PAYMENT').status).toBe('MET');
    expect(status({ COMPENSATION: ago(200), RR_IMPLEMENTATION: ago(50) }, 'COMPENSATION_PAYMENT').status).toBe('MET_LATE');
  });

  it('stops counting when the case is closed without reaching the end stage', () => {
    expect(status({ OBJECTIONS: ago(400) }, 'DECLARATION', false).status).toBe('NOT_APPLICABLE');
  });

  it('adds calendar months safely at month ends (31 Jan + 1 month = 28/29 Feb)', () => {
    const jan31 = new Date('2026-01-31T00:00:00Z');
    const d = evaluateDeadlines({ ...wf, deadlines: [{ ...wf.deadlines[0]!, startStage: 'SIA', months: 1, days: undefined }] }, { SIA: jan31 }, true, jan31)[0]!;
    expect(d.dueAt).toBe('2026-02-28T00:00:00.000Z');
  });

  it('computes stage SLA from the stage configuration', () => {
    const scrutiny = wf.stages.find((s) => s.code === 'SCRUTINY');
    expect(evaluateSla(scrutiny, ago(22), now)).toMatchObject({ overdue: true, daysRemaining: -7 });
    expect(evaluateSla(scrutiny, ago(5), now)).toMatchObject({ overdue: false, daysRemaining: 10 });
  });
});
