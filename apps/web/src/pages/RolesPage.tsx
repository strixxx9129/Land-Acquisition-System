import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LocalizedText, PermissionCode, ScopeLevel } from '@lams/shared';
import { ErrorNotice, Loading } from '../components/ErrorNotice';
import { api } from '../lib/api';
import { useText } from '../lib/useText';

interface Role {
  code: string;
  name: LocalizedText;
  description?: LocalizedText;
  scopeLevel: ScopeLevel;
  permissions: PermissionCode[];
}
interface Catalogue {
  code: PermissionCode;
  group: string;
  label: LocalizedText;
}

export function RolesPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['roles'], queryFn: () => api<{ roles: Role[]; permissionCatalogue: Catalogue[] }>('/admin/roles') });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('roles.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('roles.subtitle')}</p>
      </div>
      {q.isPending && <Loading />}
      {q.error && <ErrorNotice error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && (
        <div className="space-y-3">
          {q.data.roles.map((role) => (
            <RoleEditor key={role.code} role={role} catalogue={q.data.permissionCatalogue} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleEditor({ role, catalogue }: { role: Role; catalogue: Catalogue[] }) {
  const { t } = useTranslation();
  const text = useText();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(() => new Set(role.permissions));
  const dirty = selected.size !== role.permissions.length || role.permissions.some((p) => !selected.has(p));

  const save = useMutation({
    mutationFn: () => api<Role>(`/admin/roles/${role.code}`, { method: 'PATCH', body: { permissions: [...selected] } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });

  const groups = [...new Set(catalogue.map((c) => c.group))];
  const toggle = (code: PermissionCode) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <details className="rounded-lg border border-line bg-surface">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span>
          <span className="font-semibold">{text(role.name)}</span>
          <span className="ml-2 font-mono text-xs text-ink-muted">{role.code}</span>
        </span>
        <span className="text-xs text-ink-muted">
          {t('roles.scopeLevel')}: {t(`scope.${role.scopeLevel}`)} · {t('roles.permissionCount', { count: selected.size })}
        </span>
      </summary>
      <div className="border-t border-line px-4 py-4">
        {role.description && <p className="mb-3 text-sm text-ink-muted">{text(role.description)}</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <fieldset key={g}>
              <legend className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{g}</legend>
              {catalogue
                .filter((c) => c.group === g)
                .map((c) => (
                  <label key={c.code} className="mt-1.5 flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={selected.has(c.code)} onChange={() => toggle(c.code)} />
                    <span>
                      {text(c.label)}
                      <span className="block font-mono text-[11px] text-ink-muted">{c.code}</span>
                    </span>
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
        {save.error && (
          <div className="mt-3">
            <ErrorNotice error={save.error} />
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {save.isPending ? t('common.saving') : t('common.save')}
          </button>
          <span role="status" className="text-sm text-ink-muted">
            {dirty ? t('roles.unsaved') : save.isSuccess ? t('common.saved') : ''}
          </span>
        </div>
      </div>
    </details>
  );
}
