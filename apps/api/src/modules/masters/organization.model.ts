import { model, Schema, type InferSchemaType } from 'mongoose';
import { localizedText } from '../../lib/mongoose.js';

/** Land requiring bodies and other agencies (NHAI, rail PSUs, irrigation departments, ...). */
const organizationSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: localizedText(),
    type: { type: String, required: true, trim: true },
    level: { type: String, enum: ['CENTRAL', 'STATE'], required: true },
    stateCode: String,
  },
  { timestamps: true },
);

export type OrganizationDoc = InferSchemaType<typeof organizationSchema>;
export const Organization = model('Organization', organizationSchema);
