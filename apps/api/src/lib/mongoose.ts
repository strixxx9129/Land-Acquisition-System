import { Schema } from 'mongoose';

/** A `{ en, hi, ... }` field. Mixed so new languages need no schema change; `en` is mandatory. */
export function localizedText(required = true) {
  return {
    type: Schema.Types.Mixed,
    required,
    validate: {
      validator: (v: unknown) =>
        v == null ? !required : typeof v === 'object' && typeof (v as { en?: unknown }).en === 'string' && (v as { en: string }).en.length > 0,
      message: 'must be an object with at least an English ("en") value',
    },
  };
}

export const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);
