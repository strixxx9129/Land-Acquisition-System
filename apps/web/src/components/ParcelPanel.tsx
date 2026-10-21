import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LAND_TYPES, PARCEL_STATUSES, type ParcelStatus } from '@lams/shared';
import { api } from '../lib/api';
import { useFormat } from '../lib/format';
import { STATUS_COLORS } from '../lib/mapStyle';
import { useText } from '../lib/useText';
import { Badge } from './Badges';
import { ErrorNotice, Loading } from './ErrorNotice';

interface ParcelDetail {
  id: string;
  caseId: string;
  case?: { caseNumber: string; title: string };
  villageName: string;
  surveyNumber: string;
  ulpin?: string;
  landType: string;
  recordedAreaHa: number;
  mapAreaHa: number;
  areaDeviationPct: number;
  areaMismatch: boolean;
  status: ParcelStatus;
  owners: { name: string; share: number; relation?: string }[];
  source?: { system?: string; recordRef?: string; fetchedAt?: string };
}

export function StatusDot({ status }: { status: ParcelStatus }) {
  return <span className="inline-block size-3 shrink-0 rounded-sm border border-black/20" style={{ background: STATUS_COLORS[status] }} aria-hidden="true" />;
}

/** Parcel details beside the map (instead of a popup, so it works with keyboards, screen readers and small screens). */
export function ParcelPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const text = useText();
  const fmt = useFormat();
  const q = useQuery({ queryKey: ['parcel', id], queryFn: () => api<ParcelDetail>(`/parcels/${id}`) });

  return (
    <section aria-labelledby="parcel-title" className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 id="parcel-title" className="font-semibold">
          {q.data ? t('parcels.title', { survey: q.data.surveyNumber, village: q.data.villageName }) : t('parcels.parcel')}
        </h2>
        <button type="button" onClick={onClose} className="rounded px-2 text-lg leading-none text-ink-muted hover:text-ink" aria-label={t('common.close')}>
          ×
        </button>
      </div>
      {q.isPending && <Loading />}
      {q.error && <ErrorNotice error={q.error} />}
      {q.data && (
        <div className="mt-2 space-y-3 text-sm">
          <p className="flex items-center gap-2">
            <StatusDot status={q.data.status} />
            <span className="font-medium">{text(PARCEL_STATUSES.find((s) => s.code === q.data.status)?.label)}</span>
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <dt className="text-xs text-ink-muted">{t('parcels.ulpin')}</dt>
              <dd className="font-mono text-xs">{q.data.ulpin ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t('parcels.landType')}</dt>
              <dd>{text(LAND_TYPES.find((l) => l.code === q.data.landType)?.label)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t('parcels.recorded')}</dt>
              <dd>{fmt.number(q.data.recordedAreaHa, 4)} ha</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{t('parcels.measured')}</dt>
              <dd>{fmt.number(q.data.mapAreaHa, 4)} ha</dd>
            </div>
          </dl>
          <Badge tone={q.data.areaMismatch ? 'danger' : 'ok'}>
            {q.data.areaMismatch ? t('parcels.mismatch', { pct: q.data.areaDeviationPct }) : t('parcels.areaOk', { pct: q.data.areaDeviationPct })}
          </Badge>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('parcels.owners')}</h3>
            <ul className="mt-1 space-y-0.5">
              {q.data.owners.map((o, i) => (
                <li key={i}>
                  {o.name} <span className="text-ink-muted">· {fmt.number(o.share * 100, 1)}%{o.relation ? ` · ${o.relation}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
          {q.data.case && (
            <p>
              <Link to={`/cases/${q.data.caseId}`} className="font-medium text-brand-700 hover:underline">
                {q.data.case.title}
              </Link>
              <span className="block font-mono text-xs text-ink-muted">{q.data.case.caseNumber}</span>
            </p>
          )}
          <p className="text-xs text-ink-muted">
            {t('parcels.source', { system: q.data.source?.system ?? '—' })} · {q.data.source?.recordRef}
            {q.data.source?.fetchedAt && <> · {fmt.date(q.data.source.fetchedAt)}</>}
          </p>
        </div>
      )}
    </section>
  );
}

export function StatusLegend({ counts }: { counts?: Partial<Record<ParcelStatus, number>> }) {
  const { t } = useTranslation();
  const text = useText();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={t('map.legend')}>
      {PARCEL_STATUSES.map((s) => (
        <li key={s.code} className="flex items-center gap-1.5">
          <StatusDot status={s.code} />
          {text(s.label)}
          {counts && <span className="text-ink-muted">({counts[s.code] ?? 0})</span>}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-5 border-2 border-dashed border-orange-900" aria-hidden="true" />
        {t('map.mismatchLegend')}
      </li>
    </ul>
  );
}
