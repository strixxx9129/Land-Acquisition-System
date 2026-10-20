import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/auth.middleware.js';
import { User } from './user.model.js';

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const usersRouter = Router();

/** Lists users. The scope plugin limits results to the caller's jurisdiction; no filter is written here. */
usersRouter.get('/', requirePermission('admin.users.read'), async (req, res) => {
  const { page, pageSize } = listQuery.parse(req.query);
  const [items, total] = await Promise.all([
    User.find()
      .select('name email roleCode stateCode districtCode organizationCode designation active lastLoginAt')
      .sort({ roleCode: 1, name: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    User.countDocuments(),
  ]);
  res.json({ items, total, page, pageSize });
});
