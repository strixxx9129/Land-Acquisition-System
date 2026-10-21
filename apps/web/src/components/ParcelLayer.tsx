import { useEffect, useRef, useState } from 'react';
import { GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import type { Layer, PathOptions } from 'leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { ParcelStatus } from '@lams/shared';
import { api } from '../lib/api';
import { PARCEL_MIN_ZOOM, STATUS_COLORS } from '../lib/mapStyle';

export interface ParcelProps {
  id: string;
  caseId: string;
  caseNumber?: string;
  caseTitle?: string;
  village: string;
  surveyNumber: string;
  status: ParcelStatus;
  recordedAreaHa: number;
  mapAreaHa: number;
  areaDeviationPct: number;
  areaMismatch: boolean;
}

export interface ViewState {
  zoomedOut: boolean;
  loading: boolean;
  count: number;
  truncated: boolean;
  error: unknown;
}

interface Props {
  caseId?: string;
  mismatchOnly?: boolean;
  selectedId?: string | null;
  onSelect: (p: ParcelProps) => void;
  onState?: (s: ViewState) => void;
}

type ParcelCollection = FeatureCollection<Geometry, ParcelProps> & { truncated: boolean };

/**
 * Loads only the parcels inside the visible map area, and only once zoomed in far enough. Each pan or
 * zoom cancels the previous request, so a fast-moving user never waits on stale data.
 */
export function ParcelLayer({ caseId, mismatchOnly, selectedId, onSelect, onState }: Props) {
  const map = useMap();
  const [data, setData] = useState<ParcelCollection | null>(null);
  const [seq, setSeq] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const load = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      if (map.getZoom() < PARCEL_MIN_ZOOM) {
        setData(null);
        onState?.({ zoomedOut: true, loading: false, count: 0, truncated: false, error: null });
        return;
      }
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      const b = map.getBounds();
      const params = new URLSearchParams({ bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => n.toFixed(5)).join(',') });
      if (caseId) params.set('caseId', caseId);
      if (mismatchOnly) params.set('mismatch', 'true');
      onState?.({ zoomedOut: false, loading: true, count: 0, truncated: false, error: null });
      try {
        const res = await api<ParcelCollection>(`/gis/parcels?${params}`, { signal: ctrl.signal });
        setData(res);
        setSeq((s) => s + 1);
        onState?.({ zoomedOut: false, loading: false, count: res.features.length, truncated: res.truncated, error: null });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') onState?.({ zoomedOut: false, loading: false, count: 0, truncated: false, error: err });
      }
    }, 250);
  };

  useMapEvents({ moveend: load });
  useEffect(() => {
    load();
    return () => {
      window.clearTimeout(timer.current);
      abort.current?.abort();
    };
    // Reload when the filter changes; map moves are handled by the event above.
  }, [caseId, mismatchOnly]);

  if (!data) return null;
  const style = (f?: Feature<Geometry, ParcelProps>): PathOptions => {
    const p = f!.properties;
    const selected = p.id === selectedId;
    return {
      color: selected ? '#111827' : p.areaMismatch ? '#7c2d12' : '#1f2937',
      weight: selected ? 3 : p.areaMismatch ? 2.5 : 1,
      dashArray: p.areaMismatch ? '5 4' : undefined,
      fillColor: STATUS_COLORS[p.status],
      fillOpacity: selected ? 0.85 : 0.6,
    };
  };
  const bind = (f: Feature<Geometry, ParcelProps>, layer: Layer) => {
    layer.on('click', () => onSelect(f.properties));
    layer.bindTooltip(`${f.properties.village} · ${f.properties.surveyNumber}`, { sticky: true });
  };
  // react-leaflet's GeoJSON doesn't diff its data, so a new key re-renders it.
  return <GeoJSON key={`${seq}-${selectedId ?? ''}`} data={data} style={style} onEachFeature={bind} />;
}
