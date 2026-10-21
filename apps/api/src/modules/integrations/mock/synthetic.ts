import type { LandType, ParcelGeometry } from '@lams/shared';
import type { ParcelKey } from '../types.js';

/**
 * Deterministic synthetic land data: the same survey number always yields the same owners, area and
 * polygon, so seeds, imports and tests agree. Nothing here resembles real records.
 */

export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG. */
export function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;

const NAMES: Record<string, { given: string[]; family: string[] }> = {
  '27': {
    given: ['Ramesh', 'Sunil', 'Ganpat', 'Vitthal', 'Sandip', 'Kisan', 'Shankar', 'Balasaheb', 'Sakharam', 'Dattatray', 'Sarubai', 'Lata', 'Sunita', 'Kamal', 'Shobha', 'Mangal'],
    family: ['Patil', 'Jadhav', 'Pawar', 'Shinde', 'Kale', 'More', 'Gaikwad', 'Kadam', 'Shelar', 'Thorat', 'Wagh', 'Kolhe', 'Lande', 'Bhor'],
  },
  '09': {
    given: ['Ram Prasad', 'Shyam Lal', 'Rajendra', 'Suresh', 'Mahesh', 'Om Prakash', 'Brijesh', 'Kamla Devi', 'Sita Devi', 'Shanti Devi', 'Rakesh', 'Munni Devi'],
    family: ['Yadav', 'Verma', 'Singh', 'Maurya', 'Pal', 'Kushwaha', 'Patel', 'Nishad', 'Pandey', 'Tiwari', 'Gupta'],
  },
  '21': {
    given: ['Bijay', 'Prasanta', 'Sanjay', 'Gopal', 'Subash', 'Rabindra', 'Ashok', 'Kuni', 'Sabitri', 'Basanti', 'Pramila'],
    family: ['Behera', 'Sahoo', 'Pradhan', 'Nayak', 'Das', 'Swain', 'Jena', 'Rout', 'Patra', 'Mallick'],
  },
};

const LAND_WEIGHTS: [LandType, number][] = [
  ['AGRI_IRRIGATED', 0.34],
  ['AGRI_RAINFED', 0.36],
  ['HOMESTEAD', 0.08],
  ['COMMERCIAL', 0.04],
  ['GOVERNMENT', 0.08],
  ['WASTELAND', 0.08],
  ['FOREST', 0.02],
];

const keyString = (k: ParcelKey) => `${k.stateCode}|${k.districtCode}|${k.villageName.toLowerCase()}|${k.surveyNumber}`;

/** "45/2" -> { index: 45, sub: 2 }. */
function parseSurvey(s: string) {
  const m = /^(\d+)(?:\D+(\d+))?/.exec(s);
  return { index: m ? Number(m[1]) : hash32(s) % 400, sub: m?.[2] ? Number(m[2]) : 0 };
}

const M_PER_DEG_LAT = 111_320;
const CELL_ACROSS = 160;
const CELL_ALONG = 170;
const STRIP_WIDTH = 4;

/**
 * Lays survey numbers out as a strip of cells through the village centre (along a bearing that is
 * fixed per village), like a corridor on a cadastral sheet. Sub-divisions ("45/1", "45/2") split a cell.
 */
export function syntheticGeometry(k: ParcelKey, village: [number, number]): ParcelGeometry {
  const { index, sub } = parseSurvey(k.surveyNumber);
  const bearing = (hash32(`${k.stateCode}|${k.villageName.toLowerCase()}`) % 180) * (Math.PI / 180);
  const r = rng(hash32(keyString(k)));
  const col = index % STRIP_WIDTH;
  const row = Math.floor(index / STRIP_WIDTH) - 12;

  let along0 = row * CELL_ALONG;
  let along1 = along0 + CELL_ALONG;
  if (sub > 0) {
    const half = CELL_ALONG / 2;
    along0 = sub % 2 === 1 ? along0 : along0 + half;
    along1 = along0 + half;
  }
  const across0 = (col - STRIP_WIDTH / 2) * CELL_ACROSS;
  const across1 = across0 + CELL_ACROSS;
  const margin = () => 5 + r() * 10;
  // Corners in a local metric frame (u = along, v = across); independent margins keep it convex.
  const corners: [number, number][] = [
    [along0 + margin(), across0 + margin()],
    [along1 - margin(), across0 + margin()],
    [along1 - margin(), across1 - margin()],
    [along0 + margin(), across1 - margin()],
  ];
  const [lng0, lat0] = village;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const toLngLat = ([u, v]: [number, number]): [number, number] => {
    const east = u * Math.cos(bearing) - v * Math.sin(bearing);
    const north = u * Math.sin(bearing) + v * Math.cos(bearing);
    return [Math.round((lng0 + east / (M_PER_DEG_LAT * cos)) * 1e6) / 1e6, Math.round((lat0 + north / M_PER_DEG_LAT) * 1e6) / 1e6];
  };
  const ring = corners.map(toLngLat);
  ring.push(ring[0]!);
  return { type: 'Polygon', coordinates: [ring] };
}

/** Recorded area = measured area plus survey noise; about 8% of holdings carry a real discrepancy. */
export function syntheticRecordedArea(k: ParcelKey, measuredHa: number): number {
  const r = rng(hash32(`area|${keyString(k)}`));
  const discrepancy = r() < 0.08;
  const sign = r() < 0.5 ? -1 : 1;
  const factor = discrepancy ? 1 + sign * (0.1 + r() * 0.15) : 1 + (r() - 0.5) * 0.04;
  return Math.round(measuredHa * factor * 10_000) / 10_000;
}

export function syntheticOwners(k: ParcelKey, landType: LandType) {
  if (landType === 'GOVERNMENT' || landType === 'FOREST') {
    return [{ name: landType === 'FOREST' ? 'State Forest Department' : 'State Government (Revenue)', share: 1 }];
  }
  const r = rng(hash32(`owners|${keyString(k)}`));
  const names = NAMES[k.stateCode] ?? NAMES['27']!;
  const family = pick(r, names.family);
  const count = 1 + Math.floor(r() * (r() < 0.3 ? 4 : 2));
  const owners = Array.from({ length: count }, (_, i) => ({ name: `${pick(r, names.given)} ${family}`, share: 0, relation: i === 0 ? 'Khatedar' : 'Co-sharer' }));
  // Equal shares, with the remainder on the first owner so they sum to exactly 1.
  const each = Math.floor((1 / count) * 1000) / 1000;
  owners.forEach((o, i) => (o.share = i === 0 ? Math.round((1 - each * (count - 1)) * 1000) / 1000 : each));
  return owners;
}

export function syntheticLandType(k: ParcelKey): LandType {
  const x = rng(hash32(`type|${keyString(k)}`))();
  let acc = 0;
  for (const [type, w] of LAND_WEIGHTS) {
    acc += w;
    if (x < acc) return type;
  }
  return 'AGRI_RAINFED';
}

/** 14-character ULPIN-style identifier (synthetic). */
export function syntheticUlpin(k: ParcelKey): string {
  const h = (hash32(keyString(k)).toString(36) + hash32(`u|${keyString(k)}`).toString(36)).toUpperCase().padEnd(12, '0');
  return `${k.stateCode}${h.slice(0, 12)}`;
}
