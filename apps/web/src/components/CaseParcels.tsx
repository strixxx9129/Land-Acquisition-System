import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { LAND_TYPES, PARCEL_STATUSES, type ParcelStatus } from '@lams/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFormat } from '../lib/format';
import { OSM_ATTRIBUTION, OSM_TILES, toLatLngBounds, type Bbox } from '../lib/mapStyle';
import { useText } from '../lib/useText';
import { Badge } from './Badges';
import { ErrorNotice, Loading } from './ErrorNotice';
import { ParcelLayer } from './ParcelLayer';
import { ParcelPanel, StatusDot, StatusLegend } from './ParcelPanel';

interface ParcelRow {
  id: string;
  villageName: string;
  surveyNumber: string;
  landType: string;
  recordedAreaHa: number;
  mapAreaHa: number;
  areaDeviationPct: number;
  areaMismatch: boolean;
  status: ParcelStatus;
  owners: { name: string }[];
}

interface ImportResult {
  created: number;
  mismatches: number;
  skipped: string[];
  failed: { surveyNumber: string; reason: string }[];
}

function Fit({ bbox }: { bbox: Bbox }) {
  const map = useMap();
  useEffect(() => {
    const [w, s, e, n] = bbox;
    map.fitBounds(toLatLngBounds([w - 0.004, s - 0.004, e + 0.004, n + 0.004]), { maxZoom: 16 });
  }, [map, bbox]);
  return null;
}

/** Survey numbers like "41-48, 52, 57/1" → ["41", …, "48", "52", "57/1"]. */
function expandSurveyNumbers(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .filter(Boolean)
    .flatMap((part) => {
      const range = /^(\d+)-(\d+)$/.exec(part);
      if (!range) return [part];
      const [a, b] = [Number(range[1]), Number(range[2])];
      return b >= a && b - a < 200 ? Array.from({ length: b - a + 1 }, (_, i) => String(a + i)) : [part];
    });
}

export function CaseParcels({ caseId, villages, active }: { caseId: string; villages: string[]; active: boolean }) {
  const { t } = useTranslation();
  const text = useText();
  const fmt = useFormat();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [village, setVillage] = useState(villages[0] ?? '');
  const [surveys, setSurveys] = useState('');

  const q = useQuery({
    queryKey: ['case', caseId, 'parcels'],
    queryFn: () => api<{ items: ParcelRow[]; totals: { parcels: number; recordedAreaHa: number; mapAreaHa: number; mismatches: number }; bbox: Bbox | null; tolerancePct: number }>(`/cases/${caseId}/parcels`),
  });
  const importer = useMutation({
    mutationFn: () => api<ImportResult>(`/cases/${caseId}/parcels/import`, { method: 'POST', body: { village, surveyNumbers: expandSurveyNumbers(surveys) } }),
    onSuccess: (r) => {
      if (r.created) setSurveys('');
      void qc.invalidateQueries({ queryKey: ['case', caseId] });
      void qc.invalidateQueries({ queryKey: ['gis'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    importer.mutate();
  };
  const counts = (q.data?.items ?? []).reduce<Partial<Record<ParcelStatus, number>>>((acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }), {});
  const importErrors = importer.error instanceof ApiError ? (importer.error.details as { knownVillages?: string[] } | undefined) : undefined;

  return (
    <section aria-labelledby="parcels" className="rounded-lg border border-line bg-surface p-5">
      <h2 id="parcels" className="font-semibold">
        {t('parcels.heading')}
      </h2>
      {q.isPending && <Loading />}
      {q.error && <ErrorNotice error={q.error} />}
      {q.data && (
        <>
          <p className="mt-1 text-sm text-ink-muted">
            {t('parcels.summary', {
              count: q.data.totals.parcels,
              recorded: fmt.number(q.data.totals.recordedAreaHa, 2),
              measured: fmt.number(q.data.totals.mapAreaHa, 2),
            })}
            {q.data.totals.mismatches > 0 && <span className="ml-1 font-semibold text-danger">{t('parcels.mismatchCount', { count: q.data.totals.mismatches, pct: q.data.tolerancePct })}</span>}
          </p>

          {q.data.bbox && (
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="h-72 overflow-hidden rounded-md border border-line">
                <MapContainer bounds={toLatLngBounds(q.data.bbox)} className="h-full w-full" scrollWheelZoom={false} aria-label={t('parcels.heading')}>
                  <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} />
                  <Fit bbox={q.data.bbox} />
                  <ParcelLayer caseId={caseId} selectedId={selected} onSelect={(p) => setSelected(p.id)} />
                </MapContainer>
              </div>
              <div>{selected ? <ParcelPanel id={selected} onClose={() => setSelected(null)} /> : <p className="text-sm text-ink-muted">{t('map.clickHint')}</p>}</div>
            </div>
          )}
          {q.data.items.length > 0 && (
            <div className="mt-2">
              <StatusLegend counts={counts} />
            </div>
          )}

          {q.data.items.length > 0 && (
            <div className="mt-3 max-h-80 overflow-auto rounded-md border border-line">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{t('parcels.heading')}</caption>
                <thead className="sticky top-0 bg-brand-50 text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2">{t('parcels.survey')}</th>
                    <th scope="col" className="px-3 py-2">{t('parcels.landType')}</th>
                    <th scope="col" className="px-3 py-2 text-right">{t('parcels.recorded')}</th>
                    <th scope="col" className="px-3 py-2 text-right">{t('parcels.measured')}</th>
                    <th scope="col" className="px-3 py-2">{t('parcels.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((p) => (
                    <tr key={p.id} className={`border-t border-line ${p.id === selected ? 'bg-amber-50' : ''}`}>
                      <td className="px-3 py-1.5">
                        <button type="button" onClick={() => setSelected(p.id)} className="text-left text-brand-700 hover:underline">
                          {p.villageName} · {p.surveyNumber}
                        </button>
                        <span className="block text-xs text-ink-muted">{p.owners[0]?.name}{p.owners.length > 1 ? ` +${p.owners.length - 1}` : ''}</span>
                      </td>
                      <td className="px-3 py-1.5 text-xs">{text(LAND_TYPES.find((l) => l.code === p.landType)?.label)}</td>
                      <td className="px-3 py-1.5 text-right">{fmt.number(p.recordedAreaHa, 2)}</td>
                      <td className="px-3 py-1.5 text-right">
                        {fmt.number(p.mapAreaHa, 2)}
                        {p.areaMismatch && (
                          <span className="ml-1">
                            <Badge tone="danger">{p.areaDeviationPct}%</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-1.5 text-xs">
                          <StatusDot status={p.status} />
                          {text(PARCEL_STATUSES.find((s) => s.code === p.status)?.label)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {active && can('parcel.write') && (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-md border border-dashed border-line p-4">
          <h3 className="text-sm font-semibold">{t('parcels.importTitle')}</h3>
          <p className="text-xs text-ink-muted">{t('parcels.importHint')}</p>
          <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end">
            <div className="text-sm">
              <label htmlFor="import-village" className="block font-medium">
                {t('parcels.village')}
              </label>
              <input id="import-village" list="case-villages" value={village} onChange={(e) => setVillage(e.target.value)} required className="mt-1 w-full rounded-md border border-line px-3 py-2" />
              <datalist id="case-villages">
                {villages.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
            <div className="text-sm">
              <label htmlFor="import-surveys" className="block font-medium">
                {t('parcels.surveyNumbers')}
              </label>
              <input id="import-surveys" value={surveys} onChange={(e) => setSurveys(e.target.value)} placeholder="41-48, 52, 57/1" required className="mt-1 w-full rounded-md border border-line px-3 py-2" />
            </div>
            <button type="submit" disabled={importer.isPending} className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {importer.isPending ? t('parcels.importing') : t('parcels.import')}
            </button>
          </div>
          {importer.data && (
            <div role="status" className="rounded-md bg-canvas p-3 text-sm">
              <p>{t('parcels.importResult', { created: importer.data.created, skipped: importer.data.skipped.length, failed: importer.data.failed.length })}</p>
              {importer.data.mismatches > 0 && <p className="text-danger">{t('parcels.importMismatches', { count: importer.data.mismatches })}</p>}
              {importer.data.failed.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-ink-muted">
                  {importer.data.failed.map((f) => (
                    <li key={f.surveyNumber}>
                      {f.surveyNumber}: {f.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {importer.error != null && <ErrorNotice error={importer.error} />}
          {importErrors?.knownVillages && <p className="text-xs text-ink-muted">{t('parcels.knownVillages', { list: importErrors.knownVillages.join(', ') })}</p>}
        </form>
      )}
    </section>
  );
}
