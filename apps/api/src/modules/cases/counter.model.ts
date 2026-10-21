import { model, Schema, type ClientSession } from 'mongoose';

const counterSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } }, { versionKey: false });
const Counter = model('Counter', counterSchema);

/** Atomic, gap-tolerant sequence (e.g. case numbers per district per year). */
export async function nextSequence(key: string, session?: ClientSession): Promise<number> {
  const doc = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
  return doc.seq;
}
