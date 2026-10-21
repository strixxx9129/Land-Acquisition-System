import { Router } from 'express';
import { z } from 'zod';
import { bboxSchema, importParcelsSchema, parcelStatusSchema } from '@lams/shared';
import { notFound } from '../../lib/errors.js';
import { requirePermission } from '../auth/auth.middleware.js';
import { Case } from '../cases/case.model.js';
import { actingUserFromRequest } from '../cases/cases.service.js';
import { Parcel, type ParcelDoc } from '../parcels/parcel.model.js';
import { importParcels, presentParcel } from '../parcels/parcels.service.js';
import { getSetting } from '../settings/settings.js';
import { parcelsInView, summary } from './gis.service.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'invalid id');
type ParcelRecord = ParcelDoc & { _id: unknown };

export const gisRouter = Router();
gisRouter.use(requirePermission('parcel.read'));

gisRouter.get('/summary', async (req, res) => {
  const q = z
    .object({ level: z.enum(['national', 'state', 'district']).default('national'), code: z.string().max(20).optional() })
    .refine((v) => v.level === 'national' || !!v.code, 'code is required below national level')
    .parse(req.query);
  res.json(await summary(q.level, q.code));
});

gisRouter.get('/parcels', async (req, res) => {
  const q = z
    .object({
      bbox: bboxSchema,
      caseId: objectId.optional(),
      status: parcelStatusSchema.optional(),
      mismatch: z.enum(['true', 'false']).optional(),
    })
    .parse(req.query);
  res.json(await parcelsInView({ bbox: q.bbox, caseId: q.caseId, status: q.status, mismatchOnly: q.mismatch === 'true' }));
});

export const parcelsRouter = Router();
parcelsRouter.use(requirePermission('parcel.read'));

parcelsRouter.get('/:id', async (req, res) => {
  const p = await Parcel.findById(objectId.parse(req.params.id)).lean<ParcelRecord>();
  if (!p) throw notFound('Parcel not found');
  const c = await Case.findById(p.caseId).select('caseNumber title').lean();
  res.json({ ...(await presentParcel(p, undefined, c ? { caseNumber: c.caseNumber, title: c.title } : undefined)), geometry: p.geometry });
});

/** Mounted at /api/cases/:caseId/parcels. */
export const caseParcelsRouter = Router({ mergeParams: true });
caseParcelsRouter.use(requirePermission('parcel.read'));

caseParcelsRouter.get('/', async (req, res) => {
  const caseId = objectId.parse((req.params as { caseId: string }).caseId);
  if (!(await Case.exists({ _id: caseId }))) throw notFound('Case not found');
  const tol = await getSetting('gis.areaTolerancePct');
  const parcels = await Parcel.find({ caseId }).sort({ villageName: 1, surveyNumber: 1 }).limit(2000).lean<ParcelRecord[]>();
  const items = await Promise.all(parcels.map((p) => presentParcel(p, tol)));
  const totals = {
    parcels: items.length,
    recordedAreaHa: Math.round(items.reduce((s, p) => s + p.recordedAreaHa, 0) * 100) / 100,
    mapAreaHa: Math.round(items.reduce((s, p) => s + p.mapAreaHa, 0) * 100) / 100,
    mismatches: items.filter((p) => p.areaMismatch).length,
  };
  const bbox = items.length
    ? (items.reduce<[number, number, number, number]>(
        (b, p) => [Math.min(b[0], p.centroid![0]!), Math.min(b[1], p.centroid![1]!), Math.max(b[2], p.centroid![0]!), Math.max(b[3], p.centroid![1]!)],
        [180, 90, -180, -90],
      ) as [number, number, number, number])
    : null;
  res.json({ items, totals, bbox, tolerancePct: tol });
});

caseParcelsRouter.post('/import', requirePermission('parcel.write'), async (req, res) => {
  const caseId = objectId.parse((req.params as { caseId: string }).caseId);
  const result = await importParcels(caseId, importParcelsSchema.parse(req.body), actingUserFromRequest(req.principal!));
  res.status(result.created ? 201 : 200).json(result);
});
