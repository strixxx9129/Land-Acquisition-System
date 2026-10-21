import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { LocalizedText } from '@lams/shared';
import { ErrorNotice, Loading } from '../components/ErrorNotice';
import { api, ApiError } from '../lib/api';
import type { CaseDetail } from '../lib/types';
import { useText } from '../lib/useText';

interface Options {
  workflows: { code: string; name: LocalizedText; legalFramework: LocalizedText; applicableProjectTypes: string[] }[];
  districts: { code: string; name: LocalizedText; stateCode: string; stateName?: LocalizedText }[];
  organizations: { code: string; name: LocalizedText }[];
  projectTypes: { code: string; label: LocalizedText }[];
  publicPurposes: { code: string; label: LocalizedText }[];
  fixedOrganization: string | null;
}

const field = 'mt-1 w-full rounded-md border border-line px-3 py-2';

export function NewProposalPage() {
  const { t } = useTranslation();
  const text = useText();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ['cases', 'options'], queryFn: () => api<Options>('/cases/meta/options') });

  const [form, setForm] = useState({
    title: '',
    projectType: 'HIGHWAY',
    workflowCode: '',
    publicPurpose: 'INFRASTRUCTURE',
    districtCode: '',
    organizationCode: '',
    purpose: '',
    areaProposedHa: '',
    estimatedCostCr: '',
    affectedFamiliesEstimate: '',
    villages: '',
    urgency: false,
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const workflows = useMemo(
    () => (options.data?.workflows ?? []).filter((w) => w.applicableProjectTypes.length === 0 || w.applicableProjectTypes.includes(form.projectType)),
    [options.data, form.projectType],
  );
  const workflowCode = workflows.some((w) => w.code === form.workflowCode) ? form.workflowCode : (workflows[0]?.code ?? '');

  const create = useMutation({
    mutationFn: () =>
      api<CaseDetail>('/cases', {
        method: 'POST',
        body: {
          title: form.title,
          projectType: form.projectType,
          workflowCode,
          publicPurpose: form.publicPurpose,
          districtCode: form.districtCode,
          ...(options.data?.fixedOrganization ? {} : { organizationCode: form.organizationCode }),
          purpose: form.purpose,
          areaProposedHa: Number(form.areaProposedHa),
          ...(form.estimatedCostCr ? { estimatedCostCr: Number(form.estimatedCostCr) } : {}),
          ...(form.affectedFamiliesEstimate ? { affectedFamiliesEstimate: Number(form.affectedFamiliesEstimate) } : {}),
          villages: form.villages.split(',').map((v) => v.trim()).filter(Boolean),
          urgency: form.urgency,
        },
      }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['cases'] });
      navigate(`/cases/${c.id}`);
    },
  });

  if (options.isPending) return <Loading />;
  if (options.error) return <ErrorNotice error={options.error} onRetry={() => void options.refetch()} />;
  const o = options.data;
  const fieldErrors = create.error instanceof ApiError && Array.isArray(create.error.details) ? (create.error.details as { path: string; message: string }[]) : [];
  const errorFor = (path: string) => fieldErrors.find((e) => e.path === path)?.message;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('proposal.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('proposal.subtitle')}</p>
      </div>
      <form onSubmit={submit} className="space-y-5 rounded-lg border border-line bg-surface p-5" noValidate>
        <Field id="title" label={t('proposal.projectTitle')} error={errorFor('title')}>
          <input id="title" required value={form.title} onChange={set('title')} className={field} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="projectType" label={t('proposal.projectType')}>
            <select id="projectType" value={form.projectType} onChange={set('projectType')} className={field}>
              {o.projectTypes.map((p) => (
                <option key={p.code} value={p.code}>
                  {text(p.label)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="workflow" label={t('proposal.framework')} hint={t('proposal.frameworkHint')}>
            <select id="workflow" value={workflowCode} onChange={set('workflowCode')} className={field}>
              {workflows.map((w) => (
                <option key={w.code} value={w.code}>
                  {text(w.legalFramework)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="district" label={t('proposal.district')} error={errorFor('districtCode')}>
            <select id="district" required value={form.districtCode} onChange={set('districtCode')} className={field}>
              <option value="">{t('proposal.choose')}</option>
              {o.districts.map((d) => (
                <option key={d.code} value={d.code}>
                  {text(d.name)}, {text(d.stateName)}
                </option>
              ))}
            </select>
          </Field>
          {o.fixedOrganization ? (
            <Field id="org" label={t('proposal.organization')}>
              <input id="org" readOnly value={text(o.organizations[0]?.name)} className={`${field} bg-canvas`} />
            </Field>
          ) : (
            <Field id="org" label={t('proposal.organization')}>
              <select id="org" required value={form.organizationCode} onChange={set('organizationCode')} className={field}>
                <option value="">{t('proposal.choose')}</option>
                {o.organizations.map((org) => (
                  <option key={org.code} value={org.code}>
                    {text(org.name)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field id="publicPurpose" label={t('proposal.publicPurpose')}>
            <select id="publicPurpose" value={form.publicPurpose} onChange={set('publicPurpose')} className={field}>
              {o.publicPurposes.map((p) => (
                <option key={p.code} value={p.code}>
                  {text(p.label)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="area" label={t('proposal.area')} error={errorFor('areaProposedHa')}>
            <input id="area" type="number" inputMode="decimal" min="0" step="0.01" required value={form.areaProposedHa} onChange={set('areaProposedHa')} className={field} />
          </Field>
          <Field id="cost" label={t('proposal.cost')}>
            <input id="cost" type="number" inputMode="decimal" min="0" step="0.01" value={form.estimatedCostCr} onChange={set('estimatedCostCr')} className={field} />
          </Field>
          <Field id="families" label={t('proposal.families')}>
            <input id="families" type="number" inputMode="numeric" min="0" step="1" value={form.affectedFamiliesEstimate} onChange={set('affectedFamiliesEstimate')} className={field} />
          </Field>
        </div>
        <Field id="villages" label={t('proposal.villages')} hint={t('proposal.villagesHint')}>
          <input id="villages" value={form.villages} onChange={set('villages')} className={field} />
        </Field>
        <Field id="purpose" label={t('proposal.purpose')} error={errorFor('purpose')}>
          <textarea id="purpose" required rows={4} value={form.purpose} onChange={set('purpose')} className={field} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={form.urgency} onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.checked }))} />
          <span>{t('proposal.urgency')}</span>
        </label>
        {create.error != null && <ErrorNotice error={create.error} />}
        <div className="flex gap-3">
          <button type="submit" disabled={create.isPending} className="rounded-md bg-brand-700 px-5 py-2.5 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
            {create.isPending ? t('common.saving') : t('proposal.saveDraft')}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="rounded-md border border-line px-4 py-2.5">
            {t('common.cancel')}
          </button>
        </div>
        <p className="text-xs text-ink-muted">{t('proposal.draftNote')}</p>
      </form>
    </div>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
