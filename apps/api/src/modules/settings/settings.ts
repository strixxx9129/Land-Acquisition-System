import { model, Schema } from 'mongoose';
import { z } from 'zod';
import type { LocalizedText } from '@lams/shared';

/**
 * Operational thresholds an administrator can tune at runtime. The registry defines what each
 * setting means and how it is validated; the value lives in the database (seeded, then editable).
 */
export const SETTINGS = {
  'gis.areaTolerancePct': {
    schema: z.number().min(0).max(100),
    fallback: 5,
    label: { en: 'Area mismatch tolerance (%)', hi: 'क्षेत्रफल अंतर सहनशीलता (%)' },
    description: {
      en: 'A parcel is flagged when its map area differs from the recorded area by more than this percentage.',
      hi: 'जब मानचित्र क्षेत्रफल अभिलेखित क्षेत्रफल से इस प्रतिशत से अधिक भिन्न हो, तब भूखंड चिह्नित होता है।',
    },
  },
  'gis.parcelLoadLimit': {
    schema: z.number().int().min(100).max(5000),
    fallback: 1500,
    label: { en: 'Max parcels per map request', hi: 'प्रति मानचित्र अनुरोध अधिकतम भूखंड' },
    description: { en: 'Protects the free-tier server when a large area is in view.', hi: 'बड़े क्षेत्र के दृश्य में होने पर निःशुल्क सर्वर की सुरक्षा करता है।' },
  },
} satisfies Record<string, { schema: z.ZodType; fallback: unknown; label: LocalizedText; description: LocalizedText }>;

export type SettingKey = keyof typeof SETTINGS;
type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;

const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
export const Setting = model('Setting', settingSchema);

const TTL_MS = 60_000;
let cache: { at: number; values: Map<string, unknown> } | null = null;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const rows = await Setting.find().lean();
    cache = { at: Date.now(), values: new Map(rows.map((r) => [r.key, r.value])) };
  }
  const parsed = SETTINGS[key].schema.safeParse(cache.values.get(key));
  return (parsed.success ? parsed.data : SETTINGS[key].fallback) as SettingValue<K>;
}

export function invalidateSettings(): void {
  cache = null;
}
