import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { runAsSystem } from '../modules/access/context.js';
import { Role } from '../modules/access/role.model.js';
import { invalidateRoleCache } from '../modules/access/roles.service.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { Case } from '../modules/cases/case.model.js';
import { CaseEvent } from '../modules/cases/caseEvent.model.js';
import { Jurisdiction } from '../modules/masters/jurisdiction.model.js';
import { invalidateMasterLabels } from '../modules/masters/labels.service.js';
import { Organization } from '../modules/masters/organization.model.js';
import { User } from '../modules/users/user.model.js';
import { WorkflowDefinition } from '../modules/workflow/workflowDefinition.model.js';
import { seedCases } from './cases.js';
import { jurisdictionSeeds } from './data/jurisdictions.js';
import { organizationSeeds } from './data/organizations.js';
import { roleSeeds } from './data/roles.js';
import { staffSeeds } from './data/staff.js';
import { demoUserSeeds, type DemoUserSeed } from './data/users.js';
import { seedWorkflows } from './workflows.js';

function upsertUsers(users: DemoUserSeed[], passwordHash: string, isDemo: boolean) {
  return User.bulkWrite(
    users.map((u) => ({
      updateOne: {
        filter: { email: u.email },
        update: {
          $set: { ...u, passwordHash, isDemo, active: true, failedLoginCount: 0 },
          $unset: { lockedUntil: 1 },
          // Bumping the token version signs out anyone still holding an old session.
          $inc: { tokenVersion: 1 },
        },
        upsert: true,
      },
    })),
  );
}

/**
 * Idempotent: masters and users are upserted by natural key, workflows only change when the seed
 * file changed, and the synthetic demo cases are rebuilt with dates relative to today.
 */
export async function seedAll(): Promise<void> {
  await runAsSystem('seed', async () => {
    await Promise.all([Role, User, Jurisdiction, Organization, WorkflowDefinition, Case, CaseEvent].map((m) => m.syncIndexes()));

    await Role.bulkWrite(
      roleSeeds.map((r) => ({
        updateOne: { filter: { code: r.code }, update: { $set: r, $inc: { revision: 1 } }, upsert: true },
      })),
    );
    invalidateRoleCache();

    await Jurisdiction.bulkWrite(
      jurisdictionSeeds.map(({ centroid, ...j }) => ({
        updateOne: { filter: { code: j.code }, update: { $set: { ...j, centroid: { type: 'Point', coordinates: centroid } } }, upsert: true },
      })),
    );
    await Organization.bulkWrite(organizationSeeds.map((o) => ({ updateOne: { filter: { code: o.code }, update: { $set: o }, upsert: true } })));
    invalidateMasterLabels();

    const password = config.DEMO_USER_PASSWORD;
    if (!password) throw new Error('DEMO_USER_PASSWORD must be set to seed demo users');
    await upsertUsers(demoUserSeeds, await hashPassword(password), true);
    // Staff officers only appear in case histories; nobody knows their (random) password.
    await upsertUsers(staffSeeds, await hashPassword(randomBytes(24).toString('base64url')), false);

    await seedWorkflows();
    await seedCases();
  });
  logger.info(
    { roles: roleSeeds.length, jurisdictions: jurisdictionSeeds.length, organizations: organizationSeeds.length, users: demoUserSeeds.length + staffSeeds.length },
    'seed complete',
  );
}
