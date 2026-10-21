import { model, Schema, type InferSchemaType } from 'mongoose';
import { LAND_TYPES, PARCEL_STATUSES } from '@lams/shared';
import { pointSchema } from '../../lib/mongoose.js';
import { jurisdictionScoped } from '../access/scopePlugin.js';

/** A land holding to be acquired for a case, with its cadastral geometry and record-of-rights data. */
const parcelSchema = new Schema(
  {
    caseId: { type: Schema.Types.ObjectId, ref: 'Case', required: true, index: true },
    stateCode: { type: String, required: true },
    districtCode: { type: String, required: true },
    organizationCode: { type: String, required: true },
    villageCode: String,
    villageName: { type: String, required: true },
    surveyNumber: { type: String, required: true },
    /** Unique Land Parcel Identification Number (14 characters). */
    ulpin: { type: String, index: true },
    landType: { type: String, enum: LAND_TYPES.map((t) => t.code), required: true },
    /** Area per the land records (record of rights). */
    recordedAreaHa: { type: Number, required: true, min: 0 },
    /** Area measured from the geometry. */
    mapAreaHa: { type: Number, required: true, min: 0 },
    /** |map - recorded| / recorded, in percent. Flagged against the admin-set tolerance at read time. */
    areaDeviationPct: { type: Number, required: true, min: 0 },
    geometry: {
      type: { type: String, enum: ['Polygon', 'MultiPolygon'], required: true },
      coordinates: { type: Schema.Types.Mixed, required: true },
    },
    centroid: { type: pointSchema, required: true },
    owners: {
      type: [{ name: { type: String, required: true }, share: { type: Number, required: true }, relation: String, _id: false }],
      default: [],
    },
    status: { type: String, enum: PARCEL_STATUSES.map((s) => s.code), required: true, default: 'PROPOSED' },
    source: {
      system: String,
      recordRef: String,
      fetchedAt: Date,
    },
  },
  { timestamps: true },
);

parcelSchema.index({ geometry: '2dsphere' });
parcelSchema.index({ centroid: '2dsphere' });
parcelSchema.index({ caseId: 1, villageName: 1, surveyNumber: 1 }, { unique: true });
parcelSchema.index({ stateCode: 1, districtCode: 1, status: 1 });

jurisdictionScoped(parcelSchema, { state: 'stateCode', district: 'districtCode', organization: 'organizationCode' });

export type ParcelDoc = InferSchemaType<typeof parcelSchema>;
export const Parcel = model('Parcel', parcelSchema);
