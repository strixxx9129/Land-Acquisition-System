import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/auth.middleware.js';
import { Jurisdiction, JURISDICTION_LEVELS } from './jurisdiction.model.js';
import { Organization } from './organization.model.js';

const jurisdictionQuery = z.object({
  level: z.enum(JURISDICTION_LEVELS).optional(),
  parentCode: z.string().max(20).optional(),
  stateCode: z.string().max(20).optional(),
});

export const mastersRouter = Router();
mastersRouter.use(requirePermission('masters.read'));

mastersRouter.get('/jurisdictions', async (req, res) => {
  const q = jurisdictionQuery.parse(req.query);
  const filter: Record<string, string> = {};
  if (q.level) filter.level = q.level;
  if (q.parentCode) filter.parentCode = q.parentCode;
  if (q.stateCode) filter.stateCode = q.stateCode;
  const items = await Jurisdiction.find(filter).select('-__v -createdAt -updatedAt').sort({ code: 1 }).limit(2000).lean();
  res.json({ items });
});

mastersRouter.get('/organizations', async (_req, res) => {
  const items = await Organization.find().select('-__v -createdAt -updatedAt').sort({ code: 1 }).lean();
  res.json({ items });
});
