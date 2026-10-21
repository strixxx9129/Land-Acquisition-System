import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CASE_STATUSES } from '@lams/shared';
import { CaseTable } from '../components/CaseTable';
import { ErrorNotice, Loading } from '../components/ErrorNotice';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { CaseSummary, Paged } from '../lib/types';

const PAGE_SIZE = 20;

export function CasesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status) params.set('status', status);
  if (query) params.set('q', query);
  const q = useQuery({
    queryKey: ['cases', 'list', status, query, page],
    queryFn: () => api<Paged<CaseSummary>>(`/cases?${params}`),
    placeholderData: keepPreviousData,
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('cases.title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('cases.subtitle')}</p>
        </div>
        {can('case.create') && (
          <Link to="/cases/new" className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
            {t('cases.new')}
          </Link>
        )}
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <label className="text-sm">
          <span className="block font-medium">{t('cases.search')}</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('cases.searchHint')} className="mt-1 w-64 max-w-full rounded-md border border-line px-3 py-1.5" />
        </label>
        <label className="text-sm">
          <span className="block font-medium">{t('cases.status')}</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="mt-1 rounded-md border border-line px-2 py-1.5"
          >
            <option value="">{t('cases.allStatuses')}</option>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`caseStatus.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md border border-brand-600 px-3 py-1.5 text-sm font-semibold text-brand-700">
          {t('cases.apply')}
        </button>
      </form>

      {q.isPending && <Loading />}
      {q.error && <ErrorNotice error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (
        <>
          <p className="text-sm text-ink-muted">{t('cases.total', { count: q.data.total })}</p>
          {q.data.items.length > 0 ? <CaseTable items={q.data.items} /> : <p className="p-6 text-center text-ink-muted">{t('cases.none')}</p>}
          {pages > 1 && (
            <nav aria-label={t('cases.pagination')} className="flex items-center justify-center gap-3 text-sm">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-line px-3 py-1 disabled:opacity-40">
                {t('cases.prev')}
              </button>
              <span>{t('cases.pageOf', { page, pages })}</span>
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border border-line px-3 py-1 disabled:opacity-40">
                {t('cases.next')}
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
