import { model, Schema, type InferSchemaType } from 'mongoose';
import { SUPPORTED_LOCALES } from '@lams/shared';
import { jurisdictionScoped } from '../access/scopePlugin.js';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    roleCode: { type: String, required: true, uppercase: true },
    /** Jurisdiction keys. A district user also carries its state so state users can see it. */
    stateCode: { type: String, index: true },
    districtCode: { type: String, index: true },
    organizationCode: { type: String, index: true },
    designation: { type: String, trim: true, maxlength: 120 },
    locale: { type: String, enum: SUPPORTED_LOCALES, default: 'en' },
    active: { type: Boolean, default: true },
    isDemo: { type: Boolean, default: false },
    failedLoginCount: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    lastLoginAt: Date,
    /** Bumped to invalidate every session of this user (password change, deactivation). */
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userSchema.pre('validate', function () {
  if (this.districtCode && !this.stateCode) this.invalidate('stateCode', 'a district user must also have a state');
});

jurisdictionScoped(userSchema, { state: 'stateCode', district: 'districtCode', organization: 'organizationCode' });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
