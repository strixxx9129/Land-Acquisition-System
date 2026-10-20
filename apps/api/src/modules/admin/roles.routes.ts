import { Router } from 'express';
import { z } from 'zod';
import { localizedTextSchema, PERMISSIONS, permissionCodeSchema } from '@lams/shared';
import { badRequest, notFound } from '../../lib/errors.js';
import { currentUserActor } from '../access/context.js';
import { Role } from '../access/role.model.js';
import { invalidateRoleCache } from '../access/roles.service.js';
import { audit } from '../audit/auditLog.model.js';
import { requirePermission } from '../auth/auth.middleware.js';
import { forgetPrincipal } from '../auth/auth.service.js';

const updateRoleSchema = z
  .object({
    name: localizedTextSchema.optional(),
    permissions: z.array(permissionCodeSchema).max(PERMISSIONS.length).optional(),
  })
  .strict();

export const rolesRouter = Router();
rolesRouter.use(requirePermission('admin.roles.manage'));

rolesRouter.get('/', async (_req, res) => {
  const roles = await Role.find().sort({ code: 1 }).lean();
  res.json({ roles, permissionCatalogue: PERMISSIONS });
});

rolesRouter.patch('/:code', async (req, res) => {
  const code = z.string().regex(/^[A-Z_]{2,40}$/).parse(req.params.code);
  const changes = updateRoleSchema.parse(req.body);
  const role = await Role.findOne({ code });
  if (!role) throw notFound('Role not found');

  // Stop an admin from removing their own ability to manage roles and locking everyone out.
  const actor = currentUserActor();
  if (changes.permissions && role.code === actor.roleCode && !changes.permissions.includes('admin.roles.manage')) {
    throw badRequest('You cannot remove "admin.roles.manage" from your own role');
  }

  const before = { name: role.name, permissions: [...role.permissions] };
  if (changes.name) role.name = changes.name;
  if (changes.permissions) role.permissions = [...new Set(changes.permissions)];
  role.revision = (role.revision ?? 1) + 1;
  await role.save();

  invalidateRoleCache();
  forgetPrincipal();
  await audit({ action: 'role.update', entityType: 'Role', entityId: role.code, before, after: changes, requestId: String(req.id) });
  res.json(role.toObject());
});
