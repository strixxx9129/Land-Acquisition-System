import { Jurisdiction } from '../masters/jurisdiction.model.js';
import { MockCadastralAdapter, MockLandRecordsAdapter, type VillageLocator } from './mock/mockAdapters.js';
import type { CadastralAdapter, LandRecordsAdapter } from './types.js';

// Village centres are master data; caching them avoids two lookups per parcel during imports.
const villageCache = new Map<string, { at: number; value: [number, number] | null }>();
const VILLAGE_TTL_MS = 5 * 60_000;

const villageCentroid: VillageLocator = async (key) => {
  const cacheKey = `${key.districtCode}|${key.villageCode ?? ''}|${key.villageName.toLowerCase()}`;
  const hit = villageCache.get(cacheKey);
  if (hit && Date.now() - hit.at < VILLAGE_TTL_MS) return hit.value;
  const value = await lookupVillage(key);
  villageCache.set(cacheKey, { at: Date.now(), value });
  return value;
};

const lookupVillage: VillageLocator = async (key) => {
  const v = await Jurisdiction.findOne({
    level: 'VILLAGE',
    districtCode: key.districtCode,
    ...(key.villageCode ? { code: key.villageCode } : { 'name.en': new RegExp(`^${key.villageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }),
  })
    .select('centroid')
    .lean();
  return (v?.centroid?.coordinates as [number, number] | undefined) ?? null;
};

/**
 * The one place that decides which implementation backs each integration. A real state portal
 * adapter would be selected here by configuration (per state, if needed).
 */
let landRecords: LandRecordsAdapter = new MockLandRecordsAdapter(villageCentroid);
let cadastral: CadastralAdapter = new MockCadastralAdapter(villageCentroid);

export const integrations = {
  landRecords: () => landRecords,
  cadastral: () => cadastral,
  /** For tests. */
  override(next: { landRecords?: LandRecordsAdapter; cadastral?: CadastralAdapter }) {
    if (next.landRecords) landRecords = next.landRecords;
    if (next.cadastral) cadastral = next.cadastral;
  },
};

export * from './types.js';
