import turfArea from '@turf/area';
import turfBbox from '@turf/bbox';
import turfCentroid from '@turf/centroid';
import { feature } from '@turf/helpers';
import turfKinks from '@turf/kinks';
import type { ParcelGeometry } from '@lams/shared';
import { badRequest } from './errors.js';

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** ~0.1 m precision is plenty for cadastral parcels and keeps documents small on the free Atlas tier. */
export function roundGeometry(g: ParcelGeometry): ParcelGeometry {
  const ring = (r: number[][]) => r.map(([x, y]) => [round6(x!), round6(y!)] as [number, number]);
  return g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: g.coordinates.map(ring) }
    : { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map(ring)) };
}

/** Rejects self-intersecting rings, which MongoDB's 2dsphere index would also refuse. */
export function assertValidGeometry(g: ParcelGeometry, label = 'geometry'): void {
  const kinks = turfKinks(feature(g) as Parameters<typeof turfKinks>[0]);
  if (kinks.features.length > 0) throw badRequest(`${label} is self-intersecting`);
}

/** Geodesic area in hectares. */
export function areaHa(g: ParcelGeometry): number {
  return Math.round((turfArea(feature(g)) / 10_000) * 10_000) / 10_000;
}

export function centroidOf(g: ParcelGeometry): { type: 'Point'; coordinates: [number, number] } {
  const [x, y] = turfCentroid(feature(g)).geometry.coordinates as [number, number];
  return { type: 'Point', coordinates: [round6(x), round6(y)] };
}

export function bboxOf(g: ParcelGeometry): [number, number, number, number] {
  return turfBbox(feature(g)) as [number, number, number, number];
}

/** Recorded vs measured area, as an absolute percentage of the recorded figure. */
export function deviationPct(recordedHa: number, mapHa: number): number {
  if (recordedHa <= 0) return 100;
  return Math.round((Math.abs(mapHa - recordedHa) / recordedHa) * 1000) / 10;
}

export function bboxPolygon([w, s, e, n]: readonly [number, number, number, number]) {
  return { type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}
