import { Types } from 'mongoose';
import { PARCEL_STATUSES, type LocalizedText, type ParcelStatus } from '@lams/shared';
import { bboxPolygon } from '../../lib/geo.js';
import { Case } from '../cases/case.model.js';
import { Jurisdiction } from '../masters/jurisdiction.model.js';
import { masterLabels } from '../masters/labels.service.js';
import { Parcel } from '../parcels/parcel.model.js';
import { getSetting } from '../settings/settings.js';

export type SummaryLevel = 'national' | 'state' | 'district';

interface SummaryItem {
  kind: 'STATE' | 'DISTRICT' | 'CASE';
  code: string;
  name: LocalizedText | undefined;
  centroid: [number, number] | null;
  bbox: [number, number, number, number] | null;
  cases: number;
  activeCases: number;
  areaProposedHa: number;
  parcels: number;
  parcelAreaHa: number;
  mismatches: number;
  statusCounts: Partial<Record<ParcelStatus, number>>;
  caseNumber?: string;
  caseStatus?: string;
}

const emptyItem = (kind: SummaryItem['kind'], code: string): SummaryItem => ({
  kind,
  code,
  name: undefined,
  centroid: null,
  bbox: null,
  cases: 0,
  activeCases: 0,
  areaProposedHa: 0,
  parcels: 0,
  parcelAreaHa: 0,
  mismatches: 0,
  statusCounts: {},
});

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Aggregates for one drill-down level: states (national), districts (in a state) or cases (in a
 * district). Each item carries a centroid and bbox for the map. Jurisdiction scoping applies.
 */
export async function summary(level: SummaryLevel, code?: string) {
  const tol = await getSetting('gis.areaTolerancePct');
  const groupKey = level === 'national' ? '$stateCode' : level === 'state' ? '$districtCode' : '$caseId';
  const match: Record<string, unknown> = level === 'state' ? { stateCode: code } : level === 'district' ? { districtCode: code } : {};
  const kind: SummaryItem['kind'] = level === 'national' ? 'STATE' : level === 'state' ? 'DISTRICT' : 'CASE';

  const [caseRows, parcelRows, statusRows] = await Promise.all([
    Case.aggregate<{ _id: unknown; cases: number; active: number; area: number; caseNumber?: string; title?: string; status?: string }>([
      { $match: match },
      {
        $group: {
          _id: groupKey === '$caseId' ? '$_id' : groupKey,
          cases: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
          area: { $sum: '$areaProposedHa' },
          caseNumber: { $first: '$caseNumber' },
          title: { $first: '$title' },
          status: { $first: '$status' },
        },
      },
    ]),
    Parcel.aggregate<{ _id: unknown; n: number; area: number; mism: number; lng: number; lat: number; minLng: number; minLat: number; maxLng: number; maxLat: number }>([
      { $match: match },
      {
        $group: {
          _id: groupKey,
          n: { $sum: 1 },
          area: { $sum: '$recordedAreaHa' },
          mism: { $sum: { $cond: [{ $gt: ['$areaDeviationPct', tol] }, 1, 0] } },
          lng: { $avg: { $arrayElemAt: ['$centroid.coordinates', 0] } },
          lat: { $avg: { $arrayElemAt: ['$centroid.coordinates', 1] } },
          minLng: { $min: { $arrayElemAt: ['$centroid.coordinates', 0] } },
          minLat: { $min: { $arrayElemAt: ['$centroid.coordinates', 1] } },
          maxLng: { $max: { $arrayElemAt: ['$centroid.coordinates', 0] } },
          maxLat: { $max: { $arrayElemAt: ['$centroid.coordinates', 1] } },
        },
      },
    ]),
    Parcel.aggregate<{ _id: { k: unknown; s: ParcelStatus }; n: number }>([{ $match: match }, { $group: { _id: { k: groupKey, s: '$status' }, n: { $sum: 1 } } }]),
  ]);

  const items = new Map<string, SummaryItem>();
  const get = (k: unknown) => {
    const key = String(k);
    if (!items.has(key)) items.set(key, emptyItem(kind, key));
    return items.get(key)!;
  };
  for (const r of caseRows) {
    const item = get(r._id);
    Object.assign(item, { cases: r.cases, activeCases: r.active, areaProposedHa: round(r.area) });
    if (kind === 'CASE') Object.assign(item, { name: { en: r.title ?? '' }, caseNumber: r.caseNumber, caseStatus: r.status });
  }
  for (const r of parcelRows) {
    const item = get(r._id);
    Object.assign(item, {
      parcels: r.n,
      parcelAreaHa: round(r.area),
      mismatches: r.mism,
      centroid: [round(r.lng, 6), round(r.lat, 6)],
      bbox: [r.minLng, r.minLat, r.maxLng, r.maxLat],
    });
  }
  for (const r of statusRows) get(r._id.k).statusCounts[r._id.s] = r.n;

  // Names and fallback positions (units with cases but no parcels yet) come from the master data.
  if (kind !== 'CASE') {
    const labels = await masterLabels();
    const units = await Jurisdiction.find({ code: { $in: [...items.keys()] } }).select('code centroid').lean();
    for (const item of items.values()) {
      item.name = labels.get(`J:${item.code}`);
      item.centroid ??= (units.find((u) => u.code === item.code)?.centroid?.coordinates as [number, number] | undefined) ?? null;
    }
  } else {
    const district = code ? await Jurisdiction.findOne({ code }).select('centroid').lean() : null;
    for (const item of items.values()) item.centroid ??= (district?.centroid?.coordinates as [number, number] | undefined) ?? null;
  }
  return { level, code: code ?? null, tolerancePct: tol, items: [...items.values()].filter((i) => i.centroid) };
}

export interface ParcelQuery {
  bbox: readonly [number, number, number, number];
  caseId?: string;
  status?: ParcelStatus;
  mismatchOnly?: boolean;
}

/** Parcels intersecting the map's visible area, as GeoJSON. Capped so a zoomed-out view can't flood the server. */
export async function parcelsInView(q: ParcelQuery) {
  const [tol, limit] = await Promise.all([getSetting('gis.areaTolerancePct'), getSetting('gis.parcelLoadLimit')]);
  const filter: Record<string, unknown> = { geometry: { $geoIntersects: { $geometry: bboxPolygon(q.bbox) } } };
  if (q.caseId) filter.caseId = new Types.ObjectId(q.caseId);
  if (q.status) filter.status = q.status;
  if (q.mismatchOnly) filter.areaDeviationPct = { $gt: tol };

  const rows = await Parcel.find(filter)
    .select('caseId villageName surveyNumber status landType recordedAreaHa mapAreaHa areaDeviationPct geometry')
    .limit(limit + 1)
    .lean();
  const truncated = rows.length > limit;
  const parcels = rows.slice(0, limit);
  const cases = await Case.find({ _id: { $in: [...new Set(parcels.map((p) => String(p.caseId)))] } }).select('caseNumber title').lean();
  const caseById = new Map(cases.map((c) => [String(c._id), c]));

  return {
    type: 'FeatureCollection' as const,
    truncated,
    limit,
    tolerancePct: tol,
    features: parcels.map((p) => ({
      type: 'Feature' as const,
      id: String(p._id),
      geometry: p.geometry,
      properties: {
        id: String(p._id),
        caseId: String(p.caseId),
        caseNumber: caseById.get(String(p.caseId))?.caseNumber,
        caseTitle: caseById.get(String(p.caseId))?.title,
        village: p.villageName,
        surveyNumber: p.surveyNumber,
        status: p.status,
        landType: p.landType,
        recordedAreaHa: p.recordedAreaHa,
        mapAreaHa: p.mapAreaHa,
        areaDeviationPct: p.areaDeviationPct,
        areaMismatch: p.areaDeviationPct > tol,
      },
    })),
  };
}

export const PARCEL_STATUS_CODES = PARCEL_STATUSES.map((s) => s.code);
