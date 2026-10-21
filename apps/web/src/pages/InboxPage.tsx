import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CaseTable } from '../components/CaseTable';
import { ErrorNotice, Loading } from '../components/ErrorNotice';
import { api } from '../lib/api';
import type { CaseSummary } from '../lib/types';

export function InboxPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['cases', 'inbox'], queryFn: () => api<{ items: CaseSummary[] }>('/cases/inbox') });
  const overdue = q.data?.items.filter((c) => c.sla?.overdue || c.nextDeadline?.status === 'BREACHED').length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('inbox.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('inbox.subtitle')}</p>
      </div>
      {q.isPending && <Loading />}
      {q.error && <ErrorNotice error={q.error} onRetry={() => void q.refetch()} />}
      {q.data &&
        (q.data.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-ink-muted">{t('inbox.empty')}</p>
        ) : (
          <>
            <p className="text-sm">
              {t('inbox.count', { count: q.data.items.length })}
              {overdue > 0 && <span className="ml-2 font-semibold text-danger">{t('inbox.overdue', { count: overdue })}</span>}
            </p>
            <CaseTable items={q.data.items} showWaiting />
          </>
        ))}
    </div>
  );
}
