import type { CaseStatus, DeadlineState, LocalizedText, WorkflowInput } from '@lams/shared';

export interface Named {
  code: string;
  name?: LocalizedText;
}

export interface Sla {
  dueAt: string;
  daysRemaining: number;
  overdue: boolean;
}

export interface CaseSummary {
  id: string;
  caseNumber: string;
  title: string;
  projectType: string;
  areaProposedHa: number;
  status: CaseStatus;
  workflowCode: string;
  workflowVersion: number;
  workflowName: LocalizedText;
  stage: { code: string; name: LocalizedText; phase?: string };
  stageEnteredAt: string;
  sla: Sla | null;
  nextDeadline: DeadlineState | null;
  state: Named;
  district: Named;
  organization: Named;
  version: number;
  updatedAt: string;
}

export interface CaseAction {
  action: string;
  label: LocalizedText;
  kind: 'FORWARD' | 'BACK' | 'REJECT' | 'OTHER';
  to: { code: string; name?: LocalizedText };
  requiresRemarks: boolean;
  inputs: WorkflowInput[];
}

export interface CaseEventView {
  seq: number;
  at: string;
  action: string;
  actionLabel?: LocalizedText;
  actor: { userId?: string; name?: string; roleCode?: string };
  fromStage: { code: string; name?: LocalizedText } | null;
  toStage: { code: string; name?: LocalizedText } | null;
  remarks?: string;
  inputs?: Record<string, unknown>;
  effectiveDate?: string;
  hash: string;
}

export interface WorkflowStageView {
  code: string;
  name: LocalizedText;
  phase: string;
  terminal: boolean;
  outcome?: string;
  slaDays?: number;
  actorRoles: string[];
}

export interface CaseDetail extends CaseSummary {
  proposal: {
    publicPurpose: string;
    purpose: string;
    estimatedCostCr?: number;
    affectedFamiliesEstimate?: number;
    villages: string[];
    urgency: boolean;
  };
  canEdit: boolean;
  recorded: Record<string, unknown>;
  stageDates: Record<string, string>;
  workflow: {
    code: string;
    version: number;
    name: LocalizedText;
    legalFramework: LocalizedText;
    legalReference?: string;
    stages: WorkflowStageView[];
    mainPath: string[];
  };
  currentStageInfo: { description?: LocalizedText; requiredDocuments: { code: string; name: LocalizedText }[]; actorRoles: string[] } | null;
  deadlines: DeadlineState[];
  availableActions: CaseAction[];
  events: CaseEventView[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
