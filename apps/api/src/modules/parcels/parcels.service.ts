import type { ImportParcelsInput, LocalizedText } from '@lams/shared';
import { parcelGeometrySchema } from '@lams/shared';
import { conflict, badRequest, notFound, AppError } from '../../lib/errors.js';
import { areaHa, assertValidGeometry, centroidOf, deviationPct, roundGeometry } from '../../lib/geo.js';
import { Case } from '../cases/case.model.js';
import { recordCaseEvent, type ActingUser } from '../cases/engine.js';
import { integrations, IntegrationError, type ParcelKey } from '../integrations/index.js';
import { Jurisdiction } from '../masters/jurisdiction.model.js';
import { getSetting } from '../settings/settings.js';
import { getWorkflow } from '../workflow/workflow.service.js';
import { Parcel, type ParcelDoc } from './parcel.model.js';
import { parcelStatusForStage } from './statusSync.js';

type ParcelRecord = ParcelDoc & { _id: unknown };

export async function presentParcel(p: ParcelRecord, tolerancePct?: number, caseInfo?: { caseNumber: string; title: string }) {
  const tol = tolerancePct ?? (await getSetting('gis.areaTolerancePct'));
  return {
    id: String(p._id),
    caseId: String(p.caseId),
    case: caseInfo,
    villageName: p.villageName,
    surveyNumber: p.surveyNumber,
    ulpin: p.ulpin,
    landType: p.landType,
    recordedAreaHa: p.recordedAreaHa,
    mapAreaHa: p.mapAreaHa,
    areaDeviationPct: p.areaDeviationPct,
    areaMismatch: p.areaDeviationPct > tol,
    status: p.status,
    owners: p.owners,
    centroid: p.centroid?.coordinates,
    source: p.source,
  };
}

async function findVillage(districtCode: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Jurisdiction.findOne({ level: 'VILLAGE', districtCode, 'name.en': new RegExp(`^${escaped}$`, 'i') }).lean();
}

const BATCH = 5;

/**
 * Pulls survey numbers from the land-records and cadastral adapters and creates parcels for a case.
 * Partial success is normal (missing records, flaky sources): the result lists what happened to each.
 */
export async function importParcels(caseId: string, input: ImportParcelsInput, by: ActingUser, at = new Date()) {
  const c = await Case.findById(caseId).lean();
  if (!c) throw notFound('Case not found');
  if (c.status !== 'ACTIVE') throw conflict('Parcels can only be added to an active case');
  const village = await findVillage(c.districtCode, input.village);
  if (!village) {
    const known = await Jurisdiction.find({ level: 'VILLAGE', districtCode: c.districtCode }).select('name').lean();
    throw badRequest(`Village "${input.village}" is not in this district`, { knownVillages: known.map((v) => (v.name as LocalizedText).en) });
  }
  const villageName = (village.name as LocalizedText).en;
  const wf = (await getWorkflow(c.workflowCode, c.workflowVersion)).content;
  const stage = wf.stages.find((s) => s.code === c.currentStage)!;
  const status = parcelStatusForStage(stage) ?? 'PROPOSED';

  const wanted = [...new Set(input.surveyNumbers)];
  const existing = new Set(
    (await Parcel.find({ caseId: c._id, villageName, surveyNumber: { $in: wanted } }).select('surveyNumber').lean()).map((p) => p.surveyNumber),
  );
  const skipped = wanted.filter((s) => existing.has(s));
  const failed: { surveyNumber: string; reason: string }[] = [];
  const docs: Record<string, unknown>[] = [];
  let unavailable = 0;

  const todo = wanted.filter((s) => !existing.has(s));
  for (let i = 0; i < todo.length; i += BATCH) {
    await Promise.all(
      todo.slice(i, i + BATCH).map(async (surveyNumber) => {
        const key: ParcelKey = { stateCode: c.stateCode, districtCode: c.districtCode, villageCode: village.code, villageName, surveyNumber };
        try {
          const [record, shape] = await Promise.all([integrations.landRecords().getRecord(key), integrations.cadastral().getGeometry(key)]);
          if (!record) return void failed.push({ surveyNumber, reason: 'Not found in land records' });
          if (!shape) return void failed.push({ surveyNumber, reason: 'No cadastral geometry' });
          const parsed = parcelGeometrySchema.safeParse(shape.geometry);
          if (!parsed.success) return void failed.push({ surveyNumber, reason: `Invalid geometry: ${parsed.error.issues[0]?.message}` });
          const geometry = roundGeometry(parsed.data);
          assertValidGeometry(geometry, `Geometry of ${surveyNumber}`);
          const mapAreaHa = areaHa(geometry);
          docs.push({
            caseId: c._id,
            stateCode: c.stateCode,
            districtCode: c.districtCode,
            organizationCode: c.organizationCode,
            villageCode: village.code,
            villageName,
            surveyNumber,
            ulpin: record.ulpin,
            landType: record.landType,
            recordedAreaHa: record.areaHa,
            mapAreaHa,
            areaDeviationPct: deviationPct(record.areaHa, mapAreaHa),
            geometry,
            centroid: centroidOf(geometry),
            owners: record.owners,
            status,
            source: { system: `${integrations.landRecords().name} + ${integrations.cadastral().name}`, recordRef: record.recordRef, fetchedAt: at },
          });
        } catch (err) {
          if (err instanceof IntegrationError) unavailable++;
          failed.push({ surveyNumber, reason: (err as Error).message });
        }
      }),
    );
  }

  if (todo.length > 0 && unavailable === todo.length) {
    throw new AppError(502, 'INTEGRATION_FAILED', 'The land records service is not responding. Nothing was imported; please retry later.');
  }
  if (docs.length) {
    await Parcel.insertMany(docs, { ordered: true });
    await recordCaseEvent(String(c._id), by, 'PARCELS_IMPORTED', { village: villageName, created: docs.length, skipped: skipped.length, failed: failed.length }, at);
  }
  const tol = await getSetting('gis.areaTolerancePct');
  return {
    created: docs.length,
    mismatches: docs.filter((d) => (d.areaDeviationPct as number) > tol).length,
    skipped,
    failed,
  };
}
