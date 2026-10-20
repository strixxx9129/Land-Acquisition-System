import { model, Schema, type InferSchemaType } from 'mongoose';
import { PERMISSION_CODES, SCOPE_LEVELS } from '@lams/shared';
import { localizedText } from '../../lib/mongoose.js';

const roleSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: localizedText(),
    description: localizedText(false),
    scopeLevel: { type: String, enum: SCOPE_LEVELS, required: true },
    permissions: { type: [{ type: String, enum: PERMISSION_CODES }], default: [] },
    /** Bumped on every change so cached permission sets can be invalidated. */
    revision: { type: Number, default: 1 },
  },
  { timestamps: true },
);

export type RoleDoc = InferSchemaType<typeof roleSchema>;
export const Role = model('Role', roleSchema);
