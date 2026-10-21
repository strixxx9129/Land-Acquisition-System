import type { ClientSession, Types } from 'mongoose';
import type { ParcelStatus, WorkflowStage } from '@lams/shared';
import { Parcel } from './parcel.model.js';

/** Progress order of parcel statuses. DISPUTED sits outside it and is never moved automatically. */
const ORDER: ParcelStatus[] = ['PROPOSED', 'NOTIFIED', 'DECLARED', 'AWARDED', 'PAID', 'POSSESSED'];

/**
 * The parcel status implied by the case's stage. Keyed by workflow *phase* (a fixed, small vocabulary),
 * so any configured workflow maps without code changes.
 */
export function parcelStatusForStage(stage: Pick<WorkflowStage, 'phase' | 'terminal' | 'outcome'>): ParcelStatus | null {
  if (stage.terminal) return stage.outcome === 'COMPLETED' ? 'POSSESSED' : null;
  switch (stage.phase) {
    case 'PROPOSAL':
    case 'SIA':
      return 'PROPOSED';
    case 'NOTIFICATION':
    case 'DECLARATION':
      return 'NOTIFIED';
    case 'AWARD':
      return 'DECLARED';
    case 'COMPENSATION':
      return 'AWARDED';
    case 'RR':
    case 'POSSESSION':
      return 'PAID';
    default:
      return null;
  }
}

/** Moves a case's parcels forward to the status its new stage implies. Never moves backwards. */
export async function syncParcelStatuses(caseId: Types.ObjectId, stage: Pick<WorkflowStage, 'phase' | 'terminal' | 'outcome'>, session?: ClientSession) {
  const target = parcelStatusForStage(stage);
  if (!target) return;
  const behind = ORDER.slice(0, ORDER.indexOf(target));
  if (!behind.length) return;
  await Parcel.updateMany({ caseId, status: { $in: behind } }, { $set: { status: target } }, { session });
}
