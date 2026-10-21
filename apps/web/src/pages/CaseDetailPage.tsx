import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { PROJECT_TYPES, PUBLIC_PURPOSES } from '@lams/shared';
import { ActionDialog } from '../components/ActionDialog';
import { Badge, DeadlineBadge, SlaBadge, StatusBadge } from '../components/Badges';
import { CaseParcels } from '../components/CaseParcels';
import { Dialog } from '../components/Dialog';
import { ErrorNotice, Loading } from '../components/ErrorNotice';
import { api, ApiError } from '../lib/api';
import { useFormat } from '../lib/format';
import type { CaseAction, CaseDetail } from '../lib/types';
import { useText } from '../lib/useText';

export function CaseDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const text = useText();
  const fmt = useFormat();
  const qc = useQueryClient();
  const [action, setAction] = useState<CaseAction | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const q = useQuery({ queryKey: ['case', id], queryFn: () => api<CaseDetail>(`/cases/${id}`) });
  const integrity = useMutation({ mutationFn: () => api<{ intact: boolean; events: number; brokenAt?: number }>(`/cases/${id}/integrity`) });

  // Keep the current step visible in the horizontally scrolling stepper (horizontal only, no page jump).
  const stepper = useRef<HTMLOListElement>(null);
  const stageCode = q.data?.stage.code;
  useEffect(() => {
    const ol = stepper.current;
    const li = ol?.querySelector<HTMLElement>('[aria-current="step"]');
    if (ol && li) ol.scrollLeft = li.offsetLeft - ol.offsetLeft - ol.clientWidth / 2 + li.clientWidth / 2;
  }, [stageCode]);

  const applyUpdate = (c: CaseDetail) => {
    qc.setQueryData(['case', id], c);
    void qc.invalidateQueries({ queryKey: ['cases'] });
    integrity.reset();
  };

  const transition = async (payload: { action: string; remarks?: string; inputs: Record<string, unknown> }) => {
    try {
      const updated = await api<CaseDetail>(`/cases/${id}/transitions`, { method: 'POST', body: { ...payload, expectedVersion: q.data!.version } });
      applyUpdate(updated);
      setNotice(t('action.done', { stage: text(updated.stage.name) }));
    } catch (err) {
      // Someone else acted first: show them the fresh state rather than a dead end.
      if (err instanceof ApiError && err.code === 'STALE_VERSION') void q.refetch();
      throw err;
    }
  };

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNotice error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data;
  const projectType = PROJECT_TYPES.find((p) => p.code === c.projectType);
  const purpose = PUBLIC_PURPOSES.find((p) => p.code === c.proposal.publicPurpose);
  const mainPath = c.workflow.mainPath.map((code) => c.workflow.stages.find((s) => s.code === code)!).filter(Boolean);
  const reached = new Set(Object.keys(c.stageDates));

  return (
    <div className="space-y-5">
      <nav className="text-sm">
        <Link to="/cases" className="text-brand-600 hover:underline">
          ← {t('cases.title')}
        </Link>
      </nav>

      <header className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-ink-muted">{c.caseNumber}</p>
            <h1 className="text-xl font-semibold sm:text-2xl">{c.title}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {text(c.district.name)}, {text(c.state.name)} · {text(c.organization.name)} · {text(projectType?.label)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            <Badge tone="info">
              {text(c.workflow.legalFramework)} · v{c.workflow.version}
            </Badge>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-brand-50 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('detail.currentStage')}</p>
            <p className="font-semibold">{text(c.stage.name)}</p>
            {c.currentStageInfo?.description && <p className="text-sm text-ink-muted">{text(c.currentStageInfo.description)}</p>}
            {c.status === 'ACTIVE' && (
              <p className="mt-1 text-xs text-ink-muted">
                {t('detail.since', { date: fmt.date(c.stageEnteredAt) })} · {t('detail.withRoles', { roles: c.currentStageInfo?.actorRoles.join(', ') || '—' })}
              </p>
            )}
          </div>
          <SlaBadge sla={c.sla} />
        </div>

        <ol ref={stepper} className="mt-4 flex gap-1 overflow-x-auto pb-2" aria-label={t('detail.progress')}>
          {mainPath.map((s, i) => {
            const current = s.code === c.stage.code;
            const done = !current && reached.has(s.code);
            return (
              <li key={s.code} className="flex min-w-28 flex-1 flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
                <span
                  className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${current ? 'bg-accent-400 text-ink ring-4 ring-amber-100' : done ? 'bg-brand-700 text-white' : 'bg-slate-200 text-ink-muted'}`}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className={`mt-1 text-[11px] leading-tight ${current ? 'font-semibold' : 'text-ink-muted'}`}>{text(s.name)}</span>
              </li>
            );
          })}
        </ol>
      </header>

      {notice && (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-ok">
          {notice}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {c.availableActions.length > 0 && (
            <section aria-labelledby="actions" className="rounded-lg border-2 border-brand-600 bg-surface p-5">
              <h2 id="actions" className="font-semibold">
                {t('detail.yourActions')}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {c.availableActions.map((a) => (
                  <button
                    key={a.action}
                    type="button"
                    onClick={() => {
                      setNotice(null);
                      setAction(a);
                    }}
                    className={
                      a.kind === 'REJECT'
                        ? 'rounded-md border border-danger px-4 py-2 text-sm font-semibold text-danger hover:bg-red-50'
                        : a.kind === 'BACK'
                          ? 'rounded-md border border-line px-4 py-2 text-sm font-semibold hover:bg-canvas'
                          : 'rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800'
                    }
                  >
                    {text(a.label)}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="proposal" className="rounded-lg border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="proposal" className="font-semibold">
                {t('detail.proposal')}
              </h2>
              {c.canEdit && (
                <button type="button" onClick={() => setEditing(true)} className="rounded-md border border-brand-600 px-3 py-1 text-sm font-semibold text-brand-700">
                  {t('detail.edit')}
                </button>
              )}
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Item label={t('proposal.publicPurpose')} value={text(purpose?.label)} />
              <Item label={t('proposal.area')} value={fmt.number(c.areaProposedHa)} />
              <Item label={t('proposal.cost')} value={fmt.number(c.proposal.estimatedCostCr)} />
              <Item label={t('proposal.families')} value={fmt.number(c.proposal.affectedFamiliesEstimate, 0)} />
              <Item label={t('proposal.villages')} value={c.proposal.villages.join(', ') || '—'} />
              <Item label={t('proposal.urgencyShort')} value={c.proposal.urgency ? t('common.yes') : t('common.no')} />
              <div className="sm:col-span-2">
                <Item label={t('proposal.purpose')} value={c.proposal.purpose} />
              </div>
            </dl>
            {Object.keys(c.recorded).length > 0 && (
              <>
                <h3 className="mt-5 text-sm font-semibold">{t('detail.recorded')}</h3>
                <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {Object.entries(c.recorded).map(([k, v]) => (
                    <Item key={k} label={t(`recorded.${k}`, { defaultValue: k })} value={/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? fmt.date(String(v)) : String(v)} />
                  ))}
                </dl>
              </>
            )}
          </section>

          <CaseParcels caseId={c.id} villages={c.proposal.villages} active={c.status === 'ACTIVE'} />

          <section aria-labelledby="history" className="rounded-lg border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="history" className="font-semibold">
                {t('detail.history')}
              </h2>
              <div className="flex items-center gap-2">
                {integrity.data && (
                  <Badge tone={integrity.data.intact ? 'ok' : 'danger'}>
                    {integrity.data.intact ? t('detail.intact', { count: integrity.data.events }) : t('detail.tampered', { seq: integrity.data.brokenAt })}
                  </Badge>
                )}
                <button type="button" onClick={() => integrity.mutate()} disabled={integrity.isPending} className="rounded-md border border-line px-3 py-1 text-xs font-semibold">
                  {t('detail.verify')}
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-ink-muted">{t('detail.historyHint')}</p>
            <ol className="mt-4 space-y-4 border-l-2 border-line pl-5">
              {[...c.events].reverse().map((e) => (
                <li key={e.seq} className="relative">
                  <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-surface bg-brand-600" aria-hidden="true" />
                  <p className="text-sm">
                    <span className="font-semibold">{e.actionLabel ? text(e.actionLabel) : t(`event.${e.action}`, { defaultValue: e.action })}</span>
                    {e.toStage && e.fromStage && (
                      <span className="text-ink-muted">
                        {' '}
                        · {text(e.fromStage.name)} → {text(e.toStage.name)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {e.actor.name} ({e.actor.roleCode}) · {fmt.dateTime(e.at)}
                    {e.effectiveDate && <> · {t('detail.officialDate', { date: fmt.date(e.effectiveDate) })}</>}
                  </p>
                  {e.remarks && <p className="mt-1 rounded bg-canvas px-2 py-1 text-sm">“{e.remarks}”</p>}
                  {e.inputs && (
                    <p className="mt-1 text-xs text-ink-muted">
                      {Object.entries(e.inputs)
                        .map(([k, v]) => `${t(`recorded.${k}`, { defaultValue: k })}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
                        .join(' · ')}
                    </p>
                  )}
                  <p className="mt-0.5 font-mono text-[10px] text-ink-muted" title={e.hash}>
                    #{e.seq} · {e.hash.slice(0, 12)}…
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5">
          <section aria-labelledby="deadlines" className="rounded-lg border border-line bg-surface p-5">
            <h2 id="deadlines" className="font-semibold">
              {t('detail.deadlines')}
            </h2>
            <ul className="mt-3 space-y-3">
              {c.deadlines.map((d) => (
                <li key={d.code} className="text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{text(d.label)}</span>
                    <DeadlineBadge deadline={d} />
                  </div>
                  <p className="text-xs text-ink-muted">
                    {d.legalReference}
                    {d.dueAt && <> · {t('detail.due', { date: fmt.date(d.dueAt) })}</>}
                    {d.consequence === 'LAPSE' && <> · {t('detail.lapseRisk')}</>}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {c.currentStageInfo && c.currentStageInfo.requiredDocuments.length > 0 && (
            <section aria-labelledby="docs" className="rounded-lg border border-line bg-surface p-5">
              <h2 id="docs" className="font-semibold">
                {t('detail.documents')}
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {c.currentStageInfo.requiredDocuments.map((d) => (
                  <li key={d.code}>{text(d.name)}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-muted">{t('detail.documentsSoon')}</p>
            </section>
          )}

          <section className="rounded-lg border border-line bg-surface p-5 text-sm">
            <h2 className="font-semibold">{t('detail.framework')}</h2>
            <p className="mt-1">{text(c.workflow.name)}</p>
            <p className="mt-1 text-xs text-ink-muted">{c.workflow.legalReference}</p>
          </section>
        </aside>
      </div>

      <ActionDialog action={action} minDate={c.stageEnteredAt.slice(0, 10)} onClose={() => setAction(null)} onSubmit={transition} />
      <EditProposalDialog key={c.version} open={editing} onClose={() => setEditing(false)} c={c} onSaved={applyUpdate} />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line">{value}</dd>
    </div>
  );
}

function EditProposalDialog({ open, onClose, c, onSaved }: { open: boolean; onClose: () => void; c: CaseDetail; onSaved: (c: CaseDetail) => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    title: c.title,
    areaProposedHa: String(c.areaProposedHa),
    estimatedCostCr: c.proposal.estimatedCostCr != null ? String(c.proposal.estimatedCostCr) : '',
    villages: c.proposal.villages.join(', '),
    purpose: c.proposal.purpose,
  });
  const save = useMutation({
    mutationFn: () =>
      api<CaseDetail>(`/cases/${c.id}`, {
        method: 'PATCH',
        body: {
          expectedVersion: c.version,
          title: form.title,
          areaProposedHa: Number(form.areaProposedHa),
          ...(form.estimatedCostCr ? { estimatedCostCr: Number(form.estimatedCostCr) } : {}),
          villages: form.villages.split(',').map((v) => v.trim()).filter(Boolean),
          purpose: form.purpose,
        },
      }),
    onSuccess: (updated) => {
      onSaved(updated);
      onClose();
    },
  });
  const input = 'mt-1 w-full rounded-md border border-line px-3 py-2';
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialog open={open} onClose={onClose} title={t('detail.editTitle')}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="block text-sm font-medium">
          {t('proposal.projectTitle')}
          <input value={form.title} onChange={set('title')} className={input} />
        </label>
        <label className="block text-sm font-medium">
          {t('proposal.area')}
          <input type="number" step="0.01" min="0" value={form.areaProposedHa} onChange={set('areaProposedHa')} className={input} />
        </label>
        <label className="block text-sm font-medium">
          {t('proposal.cost')}
          <input type="number" step="0.01" min="0" value={form.estimatedCostCr} onChange={set('estimatedCostCr')} className={input} />
        </label>
        <label className="block text-sm font-medium">
          {t('proposal.villages')}
          <input value={form.villages} onChange={set('villages')} className={input} />
        </label>
        <label className="block text-sm font-medium">
          {t('proposal.purpose')}
          <textarea rows={4} value={form.purpose} onChange={set('purpose')} className={input} />
        </label>
        {save.error != null && <ErrorNotice error={save.error} />}
        <div className="flex justify-end gap-3 border-t border-line pt-3">
          <button type="button" onClick={onClose} className="rounded-md border border-line px-4 py-2 text-sm">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={save.isPending} className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {save.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
