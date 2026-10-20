import { model, Schema, type InferSchemaType } from 'mongoose';
import { localizedText, pointSchema } from '../../lib/mongoose.js';

export const JURISDICTION_LEVELS = ['STATE', 'DISTRICT', 'SUBDISTRICT', 'VILLAGE'] as const;

/**
 * Administrative units keyed by LGD (Local Government Directory) code. Public reference data,
 * so it is not jurisdiction-scoped; seeded now, refreshable from the LGD adapter later.
 */
const jurisdictionSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    level: { type: String, enum: JURISDICTION_LEVELS, required: true },
    name: localizedText(),
    parentCode: { type: String, index: true },
    stateCode: { type: String, required: true, index: true },
    districtCode: { type: String, index: true },
    centroid: pointSchema,
    /** True when the code is a synthetic placeholder rather than a verified LGD code. */
    syntheticCode: { type: Boolean, default: false },
  },
  { timestamps: true },
);

jurisdictionSchema.index({ level: 1, stateCode: 1 });

export type JurisdictionDoc = InferSchemaType<typeof jurisdictionSchema>;
export const Jurisdiction = model('Jurisdiction', jurisdictionSchema);
