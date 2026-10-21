import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LocalizedText } from '@lams/shared';
import { ErrorNotice, Loading } from '../components/ErrorNotice';
import { api } from '../lib/api';
import { useText } from '../lib/useText';

interface SettingItem {
  key: string;
  value: number;
  label: LocalizedText;
  description: LocalizedText;
}

export function SettingsPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<{ items: SettingItem[] }>('/settings') });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('settings.subtitle')}</p>
      </div>
      {q.isPending && <Loading />}
      {q.error && <ErrorNotice error={q.error} />}
      {q.data?.items.map((s) => <SettingRow key={s.key} item={s} />)}
    </div>
  );
}

function SettingRow({ item }: { item: SettingItem }) {
  const { t } = useTranslation();
  const text = useText();
  const qc = useQueryClient();
  const [value, setValue] = useState(String(item.value));
  const save = useMutation({
    mutationFn: () => api(`/settings/${item.key}`, { method: 'PUT', body: { value: Number(value) } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['gis'] });
      void qc.invalidateQueries({ queryKey: ['case'] });
    },
  });
  const id = `setting-${item.key}`;
  return (
    <form
      className="rounded-lg border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label htmlFor={id} className="block font-medium">
        {text(item.label)}
      </label>
      <p className="text-sm text-ink-muted">{text(item.description)}</p>
      <p className="mt-0.5 font-mono text-[11px] text-ink-muted">{item.key}</p>
      <div className="mt-2 flex items-center gap-3">
        <input id={id} type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className="w-32 rounded-md border border-line px-3 py-1.5" />
        <button type="submit" disabled={save.isPending || Number(value) === item.value} className="rounded-md bg-brand-700 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {save.isPending ? t('common.saving') : t('common.save')}
        </button>
        {save.isSuccess && <span role="status" className="text-sm text-ok">{t('common.saved')}</span>}
      </div>
      {save.error != null && (
        <div className="mt-2">
          <ErrorNotice error={save.error} />
        </div>
      )}
    </form>
  );
}
