import { config } from '../config.js';
import { logger } from '../logger.js';
import { runAsSystem } from '../modules/access/context.js';
import { Role } from '../modules/access/role.model.js';
import { invalidateRoleCache } from '../modules/access/roles.service.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { Jurisdiction } from '../modules/masters/jurisdiction.model.js';
import { Organization } from '../modules/masters/organization.model.js';
import { User } from '../modules/users/user.model.js';
import { jurisdictionSeeds } from './data/jurisdictions.js';
import { organizationSeeds } from './data/organizations.js';
import { roleSeeds } from './data/roles.js';
import { demoUserSeeds } from './data/users.js';

/** Idempotent: upserts by natural key, so running it twice gives the same result. */
export async function seedAll(): Promise<void> {
  await runAsSystem('seed', async () => {
    await Promise.all([Role.syncIndexes(), User.syncIndexes(), Jurisdiction.syncIndexes(), Organization.syncIndexes()]);

    await Role.bulkWrite(
      roleSeeds.map((r) => ({
        updateOne: { filter: { code: r.code }, update: { $set: r, $inc: { revision: 1 } }, upsert: true },
      })),
    );

    await Jurisdiction.bulkWrite(
      jurisdictionSeeds.map(({ centroid, ...j }) => ({
        updateOne: { filter: { code: j.code }, update: { $set: { ...j, centroid: { type: 'Point', coordinates: centroid } } }, upsert: true },
      })),
    );

    await Organization.bulkWrite(organizationSeeds.map((o) => ({ updateOne: { filter: { code: o.code }, update: { $set: o }, upsert: true } })));

    const password = config.DEMO_USER_PASSWORD;
    if (!password) throw new Error('DEMO_USER_PASSWORD must be set to seed demo users');
    const passwordHash = await hashPassword(password);
    await User.bulkWrite(
      demoUserSeeds.map((u) => ({
        updateOne: {
          filter: { email: u.email },
          update: {
            $set: { ...u, passwordHash, isDemo: true, active: true, failedLoginCount: 0 },
            $unset: { lockedUntil: 1 },
            // Bumping the token version signs out anyone still holding an old session.
            $inc: { tokenVersion: 1 },
          },
          upsert: true,
        },
      })),
    );
    invalidateRoleCache();
  });
  logger.info(
    { roles: roleSeeds.length, jurisdictions: jurisdictionSeeds.length, organizations: organizationSeeds.length, demoUsers: demoUserSeeds.length },
    'seed complete',
  );
}
