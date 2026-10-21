import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CaseStatus, DeadlineState, DeadlineStatus } from '@lams/shared';
import type { Sla } from '../lib/types';
import { useText } from '../lib/useText';

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-ink-muted border-slate-200',
  ok: 'bg-green-50 text-ok border-green-200',
  warn: 'bg-amber-50 text-warn border-amber-300',
  danger: 'bg-red-50 text-danger border-red-200',
  info: 'bg-brand-50 text-brand-700 border-brand-100',
};

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const DEADLINE_TONE: Record<DeadlineStatus, Tone> = {
  NOT_STARTED: 'neutral',
  ON_TRACK: 'ok',
  DUE_SOON: 'warn',
  BREACHED: 'danger',
  MET: 'ok',
  MET_LATE: 'warn',
  NOT_APPLICABLE: 'neutral',
};

export function DeadlineBadge({ deadline, withLabel = false }: { deadline: DeadlineState; withLabel?: boolean }) {
  const { t } = useTranslation();
  const text = useText();
  const days = deadline.daysRemaining;
  const detail =
    deadline.status === 'BREACHED' && days != null
      ? t('deadline.overdueBy', { count: Math.abs(days) })
      : deadline.status === 'DUE_SOON' || deadline.status === 'ON_TRACK'
        ? t('deadline.daysLeft', { count: days ?? 0 })
        : t(`deadline.status.${deadline.status}`);
  return (
    <Badge tone={DEADLINE_TONE[deadline.status]} title={deadline.legalReference}>
      {withLabel && <span className="font-semibold">{text(deadline.label)}:</span>} {detail}
    </Badge>
  );
}

export function SlaBadge({ sla }: { sla: Sla | null }) {
  const { t } = useTranslation();
  if (!sla) return null;
  if (sla.overdue) return <Badge tone="danger">{t('sla.overdue', { count: Math.abs(sla.daysRemaining) })}</Badge>;
  return <Badge tone={sla.daysRemaining <= 3 ? 'warn' : 'neutral'}>{t('sla.left', { count: sla.daysRemaining })}</Badge>;
}

const STATUS_TONE: Record<CaseStatus, Tone> = { ACTIVE: 'info', COMPLETED: 'ok', REJECTED: 'danger', WITHDRAWN: 'neutral', LAPSED: 'danger' };

export function StatusBadge({ status }: { status: CaseStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`caseStatus.${status}`)}</Badge>;
}
