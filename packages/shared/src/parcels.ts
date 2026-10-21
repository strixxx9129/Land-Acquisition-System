import { z } from 'zod';
import type { LocalizedText } from './i18n.js';

/** Where a parcel is in its own acquisition journey (cases move as a whole; parcels can lag or be disputed). */
export const PARCEL_STATUSES = [
  { code: 'PROPOSED', label: { en: 'Proposed', hi: 'प्रस्तावित' } },
  { code: 'NOTIFIED', label: { en: 'Notified', hi: 'अधिसूचित' } },
  { code: 'DECLARED', label: { en: 'Declared', hi: 'घोषित' } },
  { code: 'AWARDED', label: { en: 'Awarded', hi: 'अवार्ड घोषित' } },
  { code: 'PAID', label: { en: 'Compensation paid', hi: 'मुआवज़ा भुगतान' } },
  { code: 'POSSESSED', label: { en: 'Possession taken', hi: 'कब्ज़ा लिया गया' } },
  { code: 'DISPUTED', label: { en: 'Disputed / in court', hi: 'विवादित / न्यायालय में' } },
] as const satisfies readonly { code: string; label: LocalizedText }[];
export type ParcelStatus = (typeof PARCEL_STATUSES)[number]['code'];
export const parcelStatusSchema = z.enum(PARCEL_STATUSES.map((s) => s.code) as [ParcelStatus, ...ParcelStatus[]]);

export const LAND_TYPES = [
  { code: 'AGRI_IRRIGATED', label: { en: 'Agricultural — irrigated', hi: 'कृषि — सिंचित' } },
  { code: 'AGRI_RAINFED', label: { en: 'Agricultural — rain-fed', hi: 'कृषि — असिंचित' } },
  { code: 'HOMESTEAD', label: { en: 'Homestead / abadi', hi: 'आबादी / आवासीय' } },
  { code: 'COMMERCIAL', label: { en: 'Commercial', hi: 'वाणिज्यिक' } },
  { code: 'GOVERNMENT', label: { en: 'Government land', hi: 'सरकारी भूमि' } },
  { code: 'FOREST', label: { en: 'Forest', hi: 'वन' } },
  { code: 'WASTELAND', label: { en: 'Barren / wasteland', hi: 'बंजर भूमि' } },
] as const satisfies readonly { code: string; label: LocalizedText }[];
export type LandType = (typeof LAND_TYPES)[number]['code'];
export const landTypeSchema = z.enum(LAND_TYPES.map((s) => s.code) as [LandType, ...LandType[]]);

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const ring = z
  .array(position)
  .min(4, 'a polygon ring needs at least 4 positions')
  .max(2000, 'too many vertices; simplify the geometry')
  .refine((r) => r[0]![0] === r.at(-1)![0] && r[0]![1] === r.at(-1)![1], 'a polygon ring must be closed (first = last position)');

export const polygonSchema = z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1).max(20) });
export const multiPolygonSchema = z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring).min(1).max(20)).min(1).max(20) });
export const parcelGeometrySchema = z.discriminatedUnion('type', [polygonSchema, multiPolygonSchema]);
export type ParcelGeometry = z.infer<typeof parcelGeometrySchema>;

export const ownerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Share of the holding as a fraction, e.g. 0.5. */
  share: z.number().positive().max(1),
  relation: z.string().max(60).optional(),
});

/** "minLng,minLat,maxLng,maxLat" — the map's visible area. */
export const bboxSchema = z
  .string()
  .transform((s) => s.split(',').map(Number))
  .pipe(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)]))
  .refine(([w, s, e, n]) => w < e && s < n, 'bbox must be minLng,minLat,maxLng,maxLat');

export const importParcelsSchema = z.object({
  village: z.string().trim().min(1).max(100),
  /** Survey / khasra / gat numbers as they appear in the land records. */
  surveyNumbers: z.array(z.string().trim().regex(/^[0-9A-Za-z/-]{1,20}$/, 'invalid survey number')).min(1).max(200),
});
export type ImportParcelsInput = z.infer<typeof importParcelsSchema>;
