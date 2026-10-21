import { areaHa } from '../../../lib/geo.js';
import { IntegrationError, type CadastralAdapter, type LandRecordsAdapter, type ParcelKey } from '../types.js';
import { syntheticGeometry, syntheticLandType, syntheticOwners, syntheticRecordedArea, syntheticUlpin } from './synthetic.js';

export type VillageLocator = (key: ParcelKey) => Promise<[number, number] | null>;

/**
 * Behaves like a state land-records service: survey numbers starting "999" simulate an outage and
 * "0" does not exist, so error handling can be demonstrated.
 */
export class MockLandRecordsAdapter implements LandRecordsAdapter {
  readonly name = 'DILRMP (mock)';
  constructor(private readonly locateVillage: VillageLocator) {}

  async getRecord(key: ParcelKey) {
    if (key.surveyNumber.startsWith('999')) throw new IntegrationError(this.name, 'Land records service is not responding');
    if (/^0+$/.test(key.surveyNumber)) return null;
    const village = await this.locateVillage(key);
    if (!village) return null;
    const measured = areaHa(syntheticGeometry(key, village));
    const landType = syntheticLandType(key);
    return {
      ulpin: syntheticUlpin(key),
      surveyNumber: key.surveyNumber,
      villageName: key.villageName,
      landType,
      areaHa: syntheticRecordedArea(key, measured),
      owners: syntheticOwners(key, landType),
      recordRef: `ROR/${key.districtCode}/${key.villageName.toUpperCase().replace(/\s+/g, '-')}/${key.surveyNumber}`,
    };
  }
}

export class MockCadastralAdapter implements CadastralAdapter {
  readonly name = 'Bhunaksha cadastral (mock)';
  constructor(private readonly locateVillage: VillageLocator) {}

  async getGeometry(key: ParcelKey) {
    if (/^0+$/.test(key.surveyNumber)) return null;
    const village = await this.locateVillage(key);
    if (!village) return null;
    return { geometry: syntheticGeometry(key, village), sheetRef: `SHEET/${key.districtCode}/${key.villageName.toUpperCase().replace(/\s+/g, '-')}` };
  }
}
