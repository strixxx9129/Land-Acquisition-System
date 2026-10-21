import { z } from 'zod';
import { localizedTextSchema, type LocalizedText } from './i18n.js';

/**
 * A legal framework's acquisition process, expressed as data. Stages, who acts at each stage,
 * allowed transitions, inputs they capture, SLAs and statutory deadlines all live here, so an
 * administrator can change a workflow (as a new version) without touching code.
 */

const code = z.string().regex(/^[A-Z][A-Z0-9_]{1,59}$/, 'use UPPER_SNAKE_CASE');

export const STAGE_PHASES = ['PROPOSAL', 'SIA', 'NOTIFICATION', 'DECLARATION', 'AWARD', 'COMPENSATION', 'RR', 'POSSESSION', 'CLOSED'] as const;
export const TERMINAL_OUTCOMES = ['COMPLETED', 'REJECTED', 'WITHDRAWN', 'LAPSED'] as const;
export const TRANSITION_KINDS = ['FORWARD', 'BACK', 'REJECT', 'OTHER'] as const;
export const INPUT_TYPES = ['text', 'textarea', 'date', 'number'] as const;

export const workflowInputSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/, 'use camelCase'),
  label: localizedTextSchema,
  type: z.enum(INPUT_TYPES),
  required: z.boolean().default(false),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const stageSchema = z.object({
  code,
  name: localizedTextSchema,
  description: localizedTextSchema.optional(),
  phase: z.enum(STAGE_PHASES),
  /** Roles whose inbox shows a case sitting in this stage. */
  actorRoles: z.array(code).default([]),
  /** Administrative time limit for this stage (days), separate from statutory deadlines. */
  slaDays: z.number().int().positive().optional(),
  /** Whether the proposal details may still be edited while the case is here. */
  allowEdit: z.boolean().default(false),
  terminal: z.boolean().default(false),
  outcome: z.enum(TERMINAL_OUTCOMES).optional(),
  /** Documents expected at this stage; enforced once the document repository lands (M3). */
  requiredDocuments: z.array(z.object({ code, name: localizedTextSchema })).default([]),
});

export const transitionSchema = z.object({
  action: code,
  label: localizedTextSchema,
  from: z.array(code).min(1),
  to: code,
  roles: z.array(code).min(1),
  kind: z.enum(TRANSITION_KINDS).default('FORWARD'),
  requiresRemarks: z.boolean().default(false),
  inputs: z.array(workflowInputSchema).default([]),
  /** A date input whose value is recorded as the official date the target stage began (e.g. gazette date). */
  effectiveDateInput: z.string().optional(),
});

export const deadlineSchema = z
  .object({
    code,
    label: localizedTextSchema,
    /** The clock starts when the case enters this stage. */
    startStage: code,
    /** The deadline is met when the case reaches any of these stages. */
    endStages: z.array(code).min(1),
    days: z.number().int().positive().optional(),
    months: z.number().int().positive().optional(),
    /** How many days before the due date the deadline counts as "due soon". */
    warningDays: z.number().int().min(0).default(15),
    consequence: z.enum(['LAPSE', 'ESCALATE', 'INFO']),
    legalReference: z.string().max(200).optional(),
  })
  .refine((d) => (d.days ? 1 : 0) + (d.months ? 1 : 0) === 1, { message: 'give exactly one of days or months' });

export const workflowContentSchema = z.object({
  name: localizedTextSchema,
  legalFramework: localizedTextSchema,
  legalReference: z.string().max(300).optional(),
  /** Project types this framework applies to; empty = all. */
  applicableProjectTypes: z.array(code).default([]),
  initialStage: code,
  stages: z.array(stageSchema).min(2),
  transitions: z.array(transitionSchema).min(1),
  deadlines: z.array(deadlineSchema).default([]),
});

export type WorkflowContent = z.infer<typeof workflowContentSchema>;
export type WorkflowContentInput = z.input<typeof workflowContentSchema>;
export type WorkflowStage = z.infer<typeof stageSchema>;
export type WorkflowTransition = z.infer<typeof transitionSchema>;
export type WorkflowDeadline = z.infer<typeof deadlineSchema>;
export type WorkflowInput = z.infer<typeof workflowInputSchema>;

export interface WorkflowIssue {
  path: string;
  message: string;
}

/**
 * Structural checks Zod can't express: references between stages, transitions and roles must
 * resolve, every stage must be reachable, and every non-terminal stage must have a way out.
 */
export function checkWorkflowConsistency(wf: WorkflowContent, knownRoles?: ReadonlySet<string>): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const stageCodes = new Set<string>();
  wf.stages.forEach((s, i) => {
    if (stageCodes.has(s.code)) issues.push({ path: `stages.${i}.code`, message: `duplicate stage ${s.code}` });
    stageCodes.add(s.code);
    if (s.terminal && !s.outcome) issues.push({ path: `stages.${i}.outcome`, message: `terminal stage ${s.code} needs an outcome` });
    if (!s.terminal && s.outcome) issues.push({ path: `stages.${i}.outcome`, message: `only terminal stages have an outcome` });
    if (knownRoles) s.actorRoles.forEach((r) => !knownRoles.has(r) && issues.push({ path: `stages.${i}.actorRoles`, message: `unknown role ${r}` }));
  });
  if (!stageCodes.has(wf.initialStage)) issues.push({ path: 'initialStage', message: `unknown stage ${wf.initialStage}` });

  const stage = (c: string) => wf.stages.find((s) => s.code === c);
  const actionKeys = new Set<string>();
  wf.transitions.forEach((t, i) => {
    for (const f of t.from) {
      if (!stageCodes.has(f)) issues.push({ path: `transitions.${i}.from`, message: `unknown stage ${f}` });
      else if (stage(f)?.terminal) issues.push({ path: `transitions.${i}.from`, message: `cannot leave terminal stage ${f}` });
      const key = `${f}:${t.action}`;
      if (actionKeys.has(key)) issues.push({ path: `transitions.${i}.action`, message: `action ${t.action} defined twice from ${f}` });
      actionKeys.add(key);
    }
    if (!stageCodes.has(t.to)) issues.push({ path: `transitions.${i}.to`, message: `unknown stage ${t.to}` });
    if (knownRoles) t.roles.forEach((r) => !knownRoles.has(r) && issues.push({ path: `transitions.${i}.roles`, message: `unknown role ${r}` }));
    const inputKeys = new Set(t.inputs.map((x) => x.key));
    if (inputKeys.size !== t.inputs.length) issues.push({ path: `transitions.${i}.inputs`, message: 'duplicate input key' });
    if (t.effectiveDateInput) {
      const input = t.inputs.find((x) => x.key === t.effectiveDateInput);
      if (!input || input.type !== 'date' || !input.required) {
        issues.push({ path: `transitions.${i}.effectiveDateInput`, message: 'must name a required date input' });
      }
    }
  });

  wf.deadlines.forEach((d, i) => {
    if (!stageCodes.has(d.startStage)) issues.push({ path: `deadlines.${i}.startStage`, message: `unknown stage ${d.startStage}` });
    d.endStages.forEach((e) => !stageCodes.has(e) && issues.push({ path: `deadlines.${i}.endStages`, message: `unknown stage ${e}` }));
  });

  // Reachability from the initial stage, and every live stage needs an exit.
  const reachable = new Set([wf.initialStage]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const t of wf.transitions) {
      if (t.from.some((f) => reachable.has(f)) && !reachable.has(t.to)) {
        reachable.add(t.to);
        changed = true;
      }
    }
  }
  wf.stages.forEach((s, i) => {
    if (!reachable.has(s.code)) issues.push({ path: `stages.${i}`, message: `stage ${s.code} cannot be reached` });
    if (!s.terminal && !wf.transitions.some((t) => t.from.includes(s.code))) {
      issues.push({ path: `stages.${i}`, message: `stage ${s.code} has no way out` });
    }
  });
  if (!wf.stages.some((s) => s.terminal && s.outcome === 'COMPLETED')) {
    issues.push({ path: 'stages', message: 'at least one terminal stage must have outcome COMPLETED' });
  }
  return issues;
}

/**
 * The "happy path" for progress displays: stages reachable from the start through FORWARD transitions,
 * in the order the definition lists them, ending in the COMPLETED outcome. Side stages such as
 * "returned for correction" (reached only by BACK transitions) and failure outcomes are left out.
 */
export function mainPathStages(wf: WorkflowContent): string[] {
  const reached = new Set([wf.initialStage]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const t of wf.transitions) {
      if (t.kind === 'FORWARD' && t.from.some((f) => reached.has(f)) && !reached.has(t.to)) {
        reached.add(t.to);
        changed = true;
      }
    }
  }
  return wf.stages.filter((s) => reached.has(s.code) && (!s.terminal || s.outcome === 'COMPLETED')).map((s) => s.code);
}

/** Transitions available from a stage to a given role. */
export function transitionsFor(wf: WorkflowContent, stageCode: string, roleCode: string): WorkflowTransition[] {
  return wf.transitions.filter((t) => t.from.includes(stageCode) && t.roles.includes(roleCode));
}

export const DEADLINE_STATUSES = ['NOT_STARTED', 'ON_TRACK', 'DUE_SOON', 'BREACHED', 'MET', 'MET_LATE', 'NOT_APPLICABLE'] as const;
export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number];

export interface DeadlineState {
  code: string;
  label: LocalizedText;
  consequence: WorkflowDeadline['consequence'];
  legalReference?: string;
  status: DeadlineStatus;
  startedAt?: string;
  dueAt?: string;
  metAt?: string;
  /** Negative when overdue. */
  daysRemaining?: number;
}

const DAY = 86_400_000;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // 31 Jan + 1 month => last day of Feb, not 3 March.
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

export function deadlineDueDate(d: WorkflowDeadline, start: Date): Date {
  return d.months ? addMonths(start, d.months) : new Date(start.getTime() + (d.days ?? 0) * DAY);
}

/**
 * Evaluates every statutory deadline for a case. `stageDates` maps stage code -> when the case first
 * entered it (official/effective date where one was recorded).
 */
export function evaluateDeadlines(
  wf: WorkflowContent,
  stageDates: Record<string, Date | string | undefined>,
  caseOpen: boolean,
  now: Date = new Date(),
): DeadlineState[] {
  const at = (c: string) => (stageDates[c] ? new Date(stageDates[c]!) : undefined);
  return wf.deadlines.map((d) => {
    const base = { code: d.code, label: d.label, consequence: d.consequence, legalReference: d.legalReference };
    const start = at(d.startStage);
    if (!start) return { ...base, status: caseOpen ? 'NOT_STARTED' : 'NOT_APPLICABLE' } as DeadlineState;
    const due = deadlineDueDate(d, start);
    const met = d.endStages
      .map(at)
      .filter((x): x is Date => !!x && x >= start)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const common = { ...base, startedAt: start.toISOString(), dueAt: due.toISOString() };
    if (met) return { ...common, status: met <= due ? 'MET' : 'MET_LATE', metAt: met.toISOString() } as DeadlineState;
    if (!caseOpen) return { ...common, status: 'NOT_APPLICABLE' } as DeadlineState;
    const daysRemaining = Math.ceil((due.getTime() - now.getTime()) / DAY);
    const status: DeadlineStatus = daysRemaining < 0 ? 'BREACHED' : daysRemaining <= d.warningDays ? 'DUE_SOON' : 'ON_TRACK';
    return { ...common, status, daysRemaining } as DeadlineState;
  });
}

/** SLA state of the stage a case currently sits in. */
export function evaluateSla(stage: WorkflowStage | undefined, enteredAt: Date | string, now: Date = new Date()) {
  if (!stage?.slaDays || stage.terminal) return null;
  const due = new Date(new Date(enteredAt).getTime() + stage.slaDays * DAY);
  const daysRemaining = Math.ceil((due.getTime() - now.getTime()) / DAY);
  return { dueAt: due.toISOString(), daysRemaining, overdue: daysRemaining < 0 };
}

/** Builds a Zod schema for a transition's configured inputs, so the server validates them like any other input. */
export function inputsSchema(inputs: WorkflowInput[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const input of inputs) {
    let field: z.ZodType;
    if (input.type === 'number') {
      let n = z.coerce.number();
      if (input.min !== undefined) n = n.min(input.min);
      if (input.max !== undefined) n = n.max(input.max);
      field = n;
    } else if (input.type === 'date') {
      field = z.iso.date();
    } else {
      field = z.string().trim().min(input.required ? 1 : 0).max(input.type === 'textarea' ? 4000 : 300);
    }
    shape[input.key] = input.required ? field : field.optional();
  }
  return z.object(shape).strict();
}
