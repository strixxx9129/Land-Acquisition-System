import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { WorkflowContent } from '@lams/shared';
import { Badge } from '../components/Badges';
import { ErrorNotice, Loading } from '../components/ErrorNotice';
import { api, ApiError } from '../lib/api';
import { useFormat } from '../lib/format';
import { useText } from '../lib/useText';
import { STATUS_TONE } from './WorkflowsPage';

interface VersionResponse {
  code: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  content: WorkflowContent;
  notes?: string;
  activatedAt?: string;
}

const cell = 'px-3 py-2 align-top';

export function WorkflowVersionPage() {
  const { code = '', version = '' } = useParams();
  const { t } = useTranslation();
  const text = useText();
  const fmt = useFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editor, setEditor] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [validated, setValidated] = useState(false);

  const q = useQuery({ queryKey: ['workflow', code, version], queryFn: () => api<VersionResponse>(`/workflows/${code}/versions/${version}`) });
  const isDraft = q.data?.status === 'DRAFT';

  const parseEditor = () => JSON.parse(editor ?? '{}') as unknown;
  const validate = useMutation({ mutationFn: () => api('/workflows/validate', { method: 'POST', body: { content: parseEditor() } }), onSuccess: () => setValidated(true) });
  const save = useMutation({
    mutationFn: () =>
      isDraft
        ? api<{ version: number }>(`/workflows/${code}/versions/${version}`, { method: 'PUT', body: { content: parseEditor(), notes: notes || undefined } })
        : api<{ version: number }>(`/workflows/${code}/versions`, { method: 'POST', body: { content: parseEditor(), notes: notes || undefined } }),
    onSuccess: (res) => {
      setEditor(null);
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow', code] });
      navigate(`/admin/workflows/${code}/${res.version}`);
    },
  });
  const activate = useMutation({
    mutationFn: () => api(`/workflows/${code}/versions/${version}/activate`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void q.refetch();
    },
  });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNotice error={q.error} onRetry={() => void q.refetch()} />;
  const wf = q.data.content;
  const stageName = (c: string) => text(wf.stages.find((s) => s.code === c)?.name) || c;
  const editorError = [validate.error, save.error].find((e) => e != null);
  const issues = editorError instanceof ApiError && Array.isArray(editorError.details) ? (editorError.details as { path: string; message: string }[]) : [];
  const jsonError = editorError instanceof SyntaxError ? editorError.message : null;

  return (
    <div className="space-y-5">
      <nav className="text-sm">
        <Link to="/admin/workflows" className="text-brand-600 hover:underline">
          ← {t('workflows.title')}
        </Link>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-surface p-5">
        <div>
          <p className="font-mono text-xs text-ink-muted">
            {code} · {t('workflows.version', { version })}
          </p>
          <h1 className="text-xl font-semibold">{text(wf.name)}</h1>
          <p className="mt-1 text-xs text-ink-muted">{wf.legalReference}</p>
          {q.data.notes && <p className="mt-2 text-sm">{q.data.notes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[q.data.status]}>{t(`workflows.status.${q.data.status}`)}</Badge>
          {q.data.activatedAt && <span className="text-xs text-ink-muted">{t('workflows.activatedOn', { date: fmt.date(q.data.activatedAt) })}</span>}
          {editor === null && (
            <button
              type="button"
              onClick={() => {
                setEditor(JSON.stringify(wf, null, 2));
                setNotes('');
                setValidated(false);
              }}
              className="rounded-md border border-brand-600 px-3 py-1.5 text-sm font-semibold text-brand-700"
            >
              {isDraft ? t('workflows.editDraft') : t('workflows.newVersion')}
            </button>
          )}
          {isDraft && editor === null && (
            <button type="button" disabled={activate.isPending} onClick={() => activate.mutate()} className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white">
              {t('workflows.activate')}
            </button>
          )}
        </div>
      </header>
      {activate.error != null && <ErrorNotice error={activate.error} />}
      {q.data.status === 'ACTIVE' && <p className="text-sm text-ink-muted">{t('workflows.frozenNote')}</p>}

      {editor !== null && (
        <section aria-labelledby="editor" className="space-y-3 rounded-lg border-2 border-brand-600 bg-surface p-5">
          <h2 id="editor" className="font-semibold">
            {isDraft ? t('workflows.editDraft') : t('workflows.newVersion')}
          </h2>
          <p className="text-sm text-ink-muted">{t('workflows.editorHint')}</p>
          <label htmlFor="wf-notes" className="block text-sm font-medium">
            {t('workflows.notes')}
          </label>
          <input id="wf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-md border border-line px-3 py-2" />
          <label htmlFor="wf-json" className="block text-sm font-medium">
            {t('workflows.definition')}
          </label>
          <div>
            <textarea
              id="wf-json"
              value={editor}
              onChange={(e) => {
                setEditor(e.target.value);
                setValidated(false);
              }}
              spellCheck={false}
              rows={24}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-xs"
            />
          </div>
          {jsonError && <p className="text-sm text-danger">{t('workflows.badJson', { message: jsonError })}</p>}
          {issues.length > 0 && (
            <div role="alert" className="rounded-md border border-danger/40 bg-red-50 p-3 text-sm text-danger">
              <p className="font-semibold">{t('workflows.issues', { count: issues.length })}</p>
              <ul className="mt-1 list-disc pl-5">
                {issues.map((i, n) => (
                  <li key={n}>
                    <code>{i.path}</code>: {i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {editorError != null && !issues.length && !jsonError && <ErrorNotice error={editorError} />}
          {validated && !editorError && <p className="text-sm text-ok">{t('workflows.valid')}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => validate.mutate()} disabled={validate.isPending} className="rounded-md border border-line px-4 py-2 text-sm font-semibold">
              {t('workflows.validate')}
            </button>
            <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white">
              {isDraft ? t('workflows.saveDraft') : t('workflows.saveAsDraft')}
            </button>
            <button type="button" onClick={() => setEditor(null)} className="rounded-md px-4 py-2 text-sm">
              {t('common.cancel')}
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="stages" className="rounded-lg border border-line bg-surface">
        <h2 id="stages" className="border-b border-line px-5 py-3 font-semibold">
          {t('workflows.stages', { count: wf.stages.length })}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className={cell}>{t('workflows.stage')}</th>
                <th scope="col" className={cell}>{t('workflows.phase')}</th>
                <th scope="col" className={cell}>{t('workflows.actors')}</th>
                <th scope="col" className={cell}>{t('workflows.sla')}</th>
              </tr>
            </thead>
            <tbody>
              {wf.stages.map((s) => (
                <tr key={s.code} className="border-t border-line">
                  <td className={cell}>
                    {text(s.name)}
                    <span className="block font-mono text-[11px] text-ink-muted">
                      {s.code}
                      {s.code === wf.initialStage && ` · ${t('workflows.initial')}`}
                      {s.terminal && ` · ${s.outcome}`}
                    </span>
                  </td>
                  <td className={cell}>{s.phase}</td>
                  <td className={`${cell} font-mono text-xs`}>{s.actorRoles.join(', ') || '—'}</td>
                  <td className={cell}>{s.slaDays ? t('workflows.days', { count: s.slaDays }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="transitions" className="rounded-lg border border-line bg-surface">
        <h2 id="transitions" className="border-b border-line px-5 py-3 font-semibold">
          {t('workflows.transitions', { count: wf.transitions.length })}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className={cell}>{t('workflows.action')}</th>
                <th scope="col" className={cell}>{t('workflows.fromTo')}</th>
                <th scope="col" className={cell}>{t('workflows.roles')}</th>
                <th scope="col" className={cell}>{t('workflows.captures')}</th>
              </tr>
            </thead>
            <tbody>
              {wf.transitions.map((tr, i) => (
                <tr key={i} className="border-t border-line">
                  <td className={cell}>
                    {text(tr.label)}
                    <span className="block font-mono text-[11px] text-ink-muted">{tr.action}</span>
                  </td>
                  <td className={`${cell} text-xs`}>
                    {tr.from.map(stageName).join(' / ')} → <strong>{stageName(tr.to)}</strong>
                  </td>
                  <td className={`${cell} font-mono text-xs`}>{tr.roles.join(', ')}</td>
                  <td className={`${cell} text-xs`}>
                    {[...tr.inputs.map((x) => text(x.label)), ...(tr.requiresRemarks ? [t('action.remarks')] : [])].join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="deadlines" className="rounded-lg border border-line bg-surface">
        <h2 id="deadlines" className="border-b border-line px-5 py-3 font-semibold">
          {t('workflows.deadlines', { count: wf.deadlines.length })}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-50 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className={cell}>{t('workflows.deadline')}</th>
                <th scope="col" className={cell}>{t('workflows.period')}</th>
                <th scope="col" className={cell}>{t('workflows.clock')}</th>
                <th scope="col" className={cell}>{t('workflows.consequence')}</th>
              </tr>
            </thead>
            <tbody>
              {wf.deadlines.map((d) => (
                <tr key={d.code} className="border-t border-line">
                  <td className={cell}>
                    {text(d.label)}
                    <span className="block text-[11px] text-ink-muted">{d.legalReference}</span>
                  </td>
                  <td className={cell}>
                    {d.months ? t('workflows.months', { count: d.months }) : t('workflows.days', { count: d.days })}
                    <span className="block text-[11px] text-ink-muted">{t('workflows.warning', { count: d.warningDays })}</span>
                  </td>
                  <td className={`${cell} text-xs`}>
                    {stageName(d.startStage)} → {d.endStages.map(stageName).join(' / ')}
                  </td>
                  <td className={cell}>
                    <Badge tone={d.consequence === 'LAPSE' ? 'danger' : d.consequence === 'ESCALATE' ? 'warn' : 'neutral'}>{d.consequence}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
