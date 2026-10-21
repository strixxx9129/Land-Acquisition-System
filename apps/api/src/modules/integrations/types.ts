import type { LandType, ParcelGeometry } from '@lams/shared';

export interface ParcelKey {
  stateCode: string;
  districtCode: string;
  villageCode?: string;
  villageName: string;
  surveyNumber: string;
}

/** Record of rights for one holding, as a state land-records system (DILRMP / Bhulekh) returns it. */
export interface LandRecord {
  ulpin: string;
  surveyNumber: string;
  villageName: string;
  landType: LandType;
  areaHa: number;
  owners: { name: string; share: number; relation?: string }[];
  recordRef: string;
}

/**
 * Adapters isolate the system from each external source. Swapping the mock for a real state portal
 * means writing one class with the same interface; nothing else changes.
 */
export interface LandRecordsAdapter {
  readonly name: string;
  /** null when the record does not exist. Throws IntegrationError when the source is unavailable. */
  getRecord(key: ParcelKey): Promise<LandRecord | null>;
}

export interface CadastralAdapter {
  readonly name: string;
  getGeometry(key: ParcelKey): Promise<{ geometry: ParcelGeometry; sheetRef: string } | null>;
}

export class IntegrationError extends Error {
  constructor(
    readonly source: string,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}
