import { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../../lib/errors.js';
import { currentUserActor } from '../access/context.js';
import { audit } from '../audit/auditLog.model.js';
import { requirePermission } from '../auth/auth.middleware.js';
import { getSetting, invalidateSettings, Setting, SETTINGS, type SettingKey } from './settings.js';

export const settingsRouter = Router();
settingsRouter.use(requirePermission('workflow.config.manage'));

settingsRouter.get('/', async (_req, res) => {
  const keys = Object.keys(SETTINGS) as SettingKey[];
  const items = await Promise.all(keys.map(async (key) => ({ key, value: await getSetting(key), label: SETTINGS[key].label, description: SETTINGS[key].description })));
  res.json({ items });
});

settingsRouter.put('/:key', async (req, res) => {
  const key = req.params.key as SettingKey;
  if (!(key in SETTINGS)) throw badRequest('Unknown setting');
  const { value } = z.object({ value: SETTINGS[key].schema }).parse(req.body);
  const before = await getSetting(key);
  await Setting.updateOne({ key }, { $set: { value, updatedBy: currentUserActor().userId } }, { upsert: true });
  invalidateSettings();
  await audit({ action: 'setting.update', entityType: 'Setting', entityId: key, before: { value: before }, after: { value }, requestId: String(req.id) });
  res.json({ key, value });
});
