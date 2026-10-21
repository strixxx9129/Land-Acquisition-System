import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { LocalizedText, ParcelStatus } from '@lams/shared';
import { ErrorNotice } from '../components/ErrorNotice';
import { ParcelLayer, type ParcelProps, type ViewState } from '../components/ParcelLayer';
import { ParcelPanel, StatusLegend } from '../components/ParcelPanel';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFormat } from '../lib/format';
import { OSM_ATTRIBUTION, OSM_TILES, toLatLngBounds, unionBbox, type Bbox } from '../lib/mapStyle';
import { useText } from '../lib/useText';

type Level = 'national' | 'state' | 'district' | 'case';

interface SummaryItem {
  kind: 'STATE' | 'DISTRICT' | 'CASE';
  code: string;
  name?: LocalizedText;
  centroid: [number, number];
  bbox: Bbox | null;
  cases: number;
  activeCases: number;
  areaProposedHa: number;
  parcels: number;
  parcelAreaHa: number;
  mismatches: number;
  statusCounts: Partial<Record<ParcelStatus, number>>;
  caseNumber?: string;
}

interface Crumb {
  level: Level;
  code?: string;
  label: string;
  bbox?: Bbox | null;
}

const INDIA: Bbox = [68.1, 6.5, 97.4, 35.7];

function FitTo({ bbox, maxZoom }: { bbox: Bbox | null; maxZoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (!bbox) return;
    const [w, s, e, n] = bbox;
    // A single point (or a tiny box) still gets a sensible zoom.
    const pad = Math.max(e - w, n - s) < 0.02 ? 0.02 : 0;
    map.fitBounds(toLatLngBounds([w - pad, s - pad, e + pad, n + pad]), { padding: [24, 24], maxZoom });
  }, [map, bbox, maxZoom]);
  return null;
}

/**
 * National → state → district → project → parcel. Above district level the map shows aggregate
 * bubbles; parcels are drawn only for the visible area once zoomed in.
 */
export function MapPage() {
  const { t } = useTranslation();
  const text = useText();
  const fmt = useFormat();
  const { user } = useAuth();

  // Start where the user's jurisdiction is: a district officer lands on their district.
  const start: Crumb[] = useMemo(() => {
    const crumbs: Crumb[] = [{ level: 'national', label: t('map.india'), bbox: INDIA }];
    // scopeLabel is "District, State" for district users and "State" for state users.
    const parts = user ? text(user.scopeLabel).split(',').map((s) => s.trim()) : [];
    if (user?.scope.stateCode) crumbs.push({ level: 'state', code: user.scope.stateCode, label: (user.scope.districtCode ? parts[1] : parts[0]) ?? '' });
    if (user?.scope.districtCode) crumbs.push({ level: 'district', code: user.scope.districtCode, label: parts[0] ?? '' });
    return crumbs;
  }, [user, t, text]);
  const [trail, setTrail] = useState<Crumb[]>(start);
  const [mismatchOnly, setMismatchOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<ViewState | null>(null);

  const here = trail.at(-1)!;
  const summaryLevel = here.level === 'case' ? 'district' : here.level;
  const summaryCode = here.level === 'case' ? trail.at(-2)?.code : here.code;
  const q = useQuery({
    queryKey: ['gis', 'summary', summaryLevel, summaryCode],
    queryFn: () => api<{ items: SummaryItem[]; tolerancePct: number }>(`/gis/summary?level=${summaryLevel}${summaryCode ? `&code=${summaryCode}` : ''}`),
  });
  const items = q.data?.items ?? [];

  const fitBbox = useMemo<Bbox | null>(() => {
    if (here.level === 'case') return here.bbox ?? null;
    return unionBbox(items.map((i) => i.bbox), items.map((i) => i.centroid)) ?? here.bbox ?? null;
  }, [here, items]);

  const drill = (item: SummaryItem) => {
    setSelected(null);
    const label = item.kind === 'CASE' ? (item.caseNumber ?? item.code) : text(item.name);
    const level: Level = item.kind === 'STATE' ? 'state' : item.kind === 'DISTRICT' ? 'district' : 'case';
    setTrail((tr) => [...tr, { level, code: item.code, label, bbox: item.bbox }]);
  };

  const totals = items.reduce(
    (acc, i) => {
      acc.parcels += i.parcels;
      acc.area += i.parcelAreaHa;
      acc.cases += i.cases;
      acc.mismatches += i.mismatches;
      for (const [s, n] of Object.entries(i.statusCounts)) acc.status[s as ParcelStatus] = (acc.status[s as ParcelStatus] ?? 0) + (n ?? 0);
      return acc;
    },
    { parcels: 0, area: 0, cases: 0, mismatches: 0, status: {} as Partial<Record<ParcelStatus, number>> },
  );
  const caseItem = here.level === 'case' ? items.find((i) => i.code === here.code) : null;
  const showBubbles = here.level === 'national' || here.level === 'state' || here.level === 'district';
  const maxArea = Math.max(1, ...items.map((i) => i.parcelAreaHa || i.areaProposedHa));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('map.title')}</h1>
          <nav aria-label={t('map.breadcrumb')} className="mt-1">
            <ol className="flex flex-wrap items-center gap-1 text-sm">
              {trail.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden="true">›</span>}
                  {i < trail.length - 1 ? (
                    <button
                      type="button"
                      className="text-brand-600 hover:underline"
                      onClick={() => {
                        setSelected(null);
                        setTrail((tr) => tr.slice(0, i + 1));
                      }}
                    >
                      {c.label || c.code}
                    </button>
                  ) : (
                    <span className="font-semibold" aria-current="page">
                      {c.label || c.code}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mismatchOnly} onChange={(e) => setMismatchOnly(e.target.checked)} />
          {t('map.mismatchOnly', { pct: q.data?.tolerancePct ?? '' })}
        </label>
      </div>

      {q.error && <ErrorNotice error={q.error} onRetry={() => void q.refetch()} />}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          [t('map.cases'), fmt.number(caseItem ? 1 : totals.cases, 0)],
          [t('map.parcels'), fmt.number(caseItem?.parcels ?? totals.parcels, 0)],
          [t('map.area'), `${fmt.number(caseItem?.parcelAreaHa ?? totals.area, 1)} ha`],
          [t('map.mismatches'), fmt.number(caseItem?.mismatches ?? totals.mismatches, 0)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-surface px-3 py-2">
            <dt className="text-xs text-ink-muted">{k}</dt>
            <dd className="text-lg font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-2">
          <div className="h-[60dvh] min-h-80 overflow-hidden rounded-lg border border-line">
            <MapContainer bounds={toLatLngBounds(INDIA)} className="h-full w-full" scrollWheelZoom aria-label={t('map.title')}>
              <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} />
              <FitTo bbox={fitBbox} maxZoom={here.level === 'case' ? 16 : here.level === 'district' ? 13 : 9} />
              {showBubbles &&
                items.map((i) => (
                  <CircleMarker
                    key={i.code}
                    center={[i.centroid[1], i.centroid[0]]}
                    radius={8 + 22 * Math.sqrt((i.parcelAreaHa || i.areaProposedHa) / maxArea)}
                    pathOptions={{ color: '#162c48', weight: 2, fillColor: i.mismatches ? '#f4a535' : '#2b5283', fillOpacity: 0.55 }}
                    eventHandlers={{ click: () => drill(i) }}
                  >
                    <Tooltip>
                      <strong>{i.kind === 'CASE' ? text(i.name) : text(i.name)}</strong>
                      <br />
                      {t('map.bubble', { cases: i.cases, parcels: i.parcels, area: fmt.number(i.parcelAreaHa, 1) })}
                    </Tooltip>
                  </CircleMarker>
                ))}
              {(here.level === 'district' || here.level === 'case') && (
                <ParcelLayer
                  caseId={here.level === 'case' ? here.code : undefined}
                  mismatchOnly={mismatchOnly}
                  selectedId={selected}
                  onSelect={(p: ParcelProps) => setSelected(p.id)}
                  onState={setView}
                />
              )}
            </MapContainer>
          </div>
          <StatusLegend counts={caseItem?.statusCounts ?? totals.status} />
          {view && (here.level === 'district' || here.level === 'case') && (
            <p role="status" className="text-xs text-ink-muted">
              {view.zoomedOut
                ? t('map.zoomIn')
                : view.loading
                  ? t('common.loading')
                  : view.truncated
                    ? t('map.truncated', { count: view.count })
                    : t('map.showing', { count: view.count })}
            </p>
          )}
          {view?.error != null && <ErrorNotice error={view.error} />}
        </div>

        <aside className="space-y-4">
          {selected && <ParcelPanel id={selected} onClose={() => setSelected(null)} />}
          {showBubbles && (
            <section aria-labelledby="units" className="rounded-lg border border-line bg-surface p-4">
              <h2 id="units" className="font-semibold">
                {t(`map.list.${summaryLevel}`)}
              </h2>
              <ul className="mt-2 divide-y divide-line">
                {items.map((i) => (
                  <li key={i.code}>
                    <button type="button" onClick={() => drill(i)} className="w-full py-2 text-left hover:bg-brand-50">
                      <span className="block text-sm font-medium text-brand-700">{text(i.name)}</span>
                      <span className="block text-xs text-ink-muted">
                        {i.caseNumber ? `${i.caseNumber} · ` : ''}
                        {t('map.bubble', { cases: i.cases, parcels: i.parcels, area: fmt.number(i.parcelAreaHa, 1) })}
                        {i.mismatches > 0 && <> · {t('map.mismatchCount', { count: i.mismatches })}</>}
                      </span>
                    </button>
                  </li>
                ))}
                {items.length === 0 && !q.isPending && <li className="py-2 text-sm text-ink-muted">{t('map.empty')}</li>}
              </ul>
            </section>
          )}
          {!selected && (here.level === 'district' || here.level === 'case') && <p className="text-sm text-ink-muted">{t('map.clickHint')}</p>}
        </aside>
      </div>
      <p className="text-xs text-ink-muted">{t('map.dataNote')}</p>
    </div>
  );
}
