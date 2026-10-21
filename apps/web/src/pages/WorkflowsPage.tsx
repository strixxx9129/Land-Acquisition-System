import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { LocalizedText } from '@lams/shared';
import { Badge } from '../components/Badges';
import { ErrorNotice, Loading } from '../components/ErrorNotice';
import { api } from '../lib/api';
import { useFormat } from '../lib/format';
import { useText } from '../lib/useText';

interface WorkflowListItem {
  code: string;
  name?: LocalizedText;
  legalFramework?: LocalizedText;
  applicableProjectTypes?: string[];
  versions: { version: number; status: 'DRAFT' | 'ACTIVE' | 'RETIRED'; notes?: string; activatedAt?: string; updatedAt: string }[];
}

export const STATUS_TONE = { DRAFT: 'warn', ACTIVE: 'ok', RETIRED: 'neutral' } as const;

export function WorkflowsPage() {
  const { t } = useTranslation();
  const text = useText();
  const fmt = useFormat();
  const q = useQuery({ queryKey: ['workflows'], queryFn: () => api<{ items: WorkflowListItem[] }>('/workflows') });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('workflows.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('workflows.subtitle')}</p>
      </div>
      {q.isPending && <Loading />}
      {q.error && <ErrorNotice error={q.error} onRetry={() => void q.refetch()} />}
      {q.data?.items.map((w) => (
        <section key={w.code} className="rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-semibold">{text(w.name)}</h2>
              <p className="font-mono text-xs text-ink-muted">{w.code}</p>
            </div>
            <p className="text-xs text-ink-muted">
              {t('workflows.appliesTo')}: {w.applicableProjectTypes?.length ? w.applicableProjectTypes.join(', ') : t('workflows.allTypes')}
            </p>
          </div>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line">
            {w.versions.map((v) => (
              <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <Link to={`/admin/workflows/${w.code}/${v.version}`} className="font-medium text-brand-700 hover:underline">
                  {t('workflows.version', { version: v.version })}
                </Link>
                <span className="flex-1 truncate px-2 text-xs text-ink-muted">{v.notes}</span>
                <span className="text-xs text-ink-muted">{v.activatedAt ? t('workflows.activatedOn', { date: fmt.date(v.activatedAt) }) : fmt.date(v.updatedAt)}</span>
                <Badge tone={STATUS_TONE[v.status]}>{t(`workflows.status.${v.status}`)}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
