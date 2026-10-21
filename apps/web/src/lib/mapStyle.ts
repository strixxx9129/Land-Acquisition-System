import type { ParcelStatus } from '@lams/shared';

/**
 * Parcel status colours: ordered light → dark along the acquisition journey, with disputes in red.
 * Status is always also shown as text (legend, panel, table), never by colour alone.
 */
export const STATUS_COLORS: Record<ParcelStatus, string> = {
  PROPOSED: '#94a3b8',
  NOTIFIED: '#60a5fa',
  DECLARED: '#8b5cf6',
  AWARDED: '#f59e0b',
  PAID: '#0d9488',
  POSSESSED: '#15803d',
  DISPUTED: '#dc2626',
};

/** Parcels are fetched per viewport only from this zoom level; below it the map shows aggregates. */
export const PARCEL_MIN_ZOOM = 12;

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type Bbox = [number, number, number, number];

/** Leaflet wants [[south, west], [north, east]]. */
export const toLatLngBounds = ([w, s, e, n]: Bbox): [[number, number], [number, number]] => [
  [s, w],
  [n, e],
];

export function unionBbox(boxes: (Bbox | null | undefined)[], points: ([number, number] | null | undefined)[] = []): Bbox | null {
  let b: Bbox | null = null;
  const add = (w: number, s: number, e: number, n: number) => {
    b = b ? [Math.min(b[0], w), Math.min(b[1], s), Math.max(b[2], e), Math.max(b[3], n)] : [w, s, e, n];
  };
  for (const box of boxes) if (box) add(...box);
  for (const p of points) if (p) add(p[0], p[1], p[0], p[1]);
  return b;
}
