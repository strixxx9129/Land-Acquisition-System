import { model, Schema } from 'mongoose';

/**
 * One refresh-token session. Tokens rotate on every refresh; the chain shares a familyId so
 * that replaying an already-used token revokes the whole chain (token theft detection).
 */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    rotatedAt: Date,
    revokedAt: Date,
    revokedReason: String,
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);

// Atlas removes expired sessions on its own, keeping the free 512 MB tier tidy.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model('Session', sessionSchema);
