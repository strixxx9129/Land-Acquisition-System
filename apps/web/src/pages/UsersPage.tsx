import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ErrorNotice, Loading } from '../components/ErrorNotice';
import { api } from '../lib/api';

interface UserRow {
  _id: string;
  name: string;
  email: string;
  roleCode: string;
  designation?: string;
  stateCode?: string;
  districtCode?: string;
  organizationCode?: string;
  lastLoginAt?: string;
}

export function UsersPage() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ['users'], queryFn: () => api<{ items: UserRow[]; total: number }>('/users?pageSize=100') });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('users.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('users.subtitle')}</p>
      </div>
      {q.isPending && <Loading />}
      {q.error && <ErrorNotice error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (
        <>
          <p className="text-sm text-ink-muted">{t('users.total', { count: q.data.total })}</p>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-50 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">{t('users.name')}</th>
                  <th scope="col" className="px-3 py-2">{t('users.email')}</th>
                  <th scope="col" className="px-3 py-2">{t('users.role')}</th>
                  <th scope="col" className="px-3 py-2">{t('users.jurisdiction')}</th>
                  <th scope="col" className="px-3 py-2">{t('users.lastLogin')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((u) => (
                  <tr key={u._id} className="border-t border-line">
                    <td className="px-3 py-2">
                      <span className="font-medium">{u.name}</span>
                      {u.designation && <span className="block text-xs text-ink-muted">{u.designation}</span>}
                    </td>
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2 font-mono text-xs">{u.roleCode}</td>
                    <td className="px-3 py-2 font-mono text-xs">{[u.stateCode, u.districtCode, u.organizationCode].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-3 py-2 text-xs">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString(i18n.language) : t('users.never')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
