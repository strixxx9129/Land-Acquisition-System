import { Types } from 'mongoose';
import type { WorkflowTransition } from '@lams/shared';
import { logger } from '../logger.js';
import { getRole } from '../modules/access/roles.service.js';
import { Case } from '../modules/cases/case.model.js';
import { CaseEvent } from '../modules/cases/caseEvent.model.js';
import { createCase, transitionCase, type ActingUser } from '../modules/cases/engine.js';
import { hash32 } from '../modules/integrations/mock/synthetic.js';
import { Parcel } from '../modules/parcels/parcel.model.js';
import { importParcels } from '../modules/parcels/parcels.service.js';
import { User } from '../modules/users/user.model.js';
import { getWorkflow } from '../modules/workflow/workflow.service.js';
import { caseSeeds, type CaseSeed } from './data/cases.js';

const DAY = 86_400_000;
const daysAgo = (n: number, now: Date) => new Date(now.getTime() - n * DAY);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

async function actingUser(email: string, cache: Map<string, ActingUser>): Promise<ActingUser> {
  const hit = cache.get(email);
  if (hit) return hit;
  const user = await User.findOne({ email }).lean();
  if (!user) throw new Error(`seed user ${email} not found`);
  const role = await getRole(user.roleCode);
  if (!role) throw new Error(`role ${user.roleCode} not found`);
  const acting: ActingUser = {
    userId: String(user._id),
    name: user.name,
    roleCode: role.code,
    organizationCode: role.scopeLevel === 'ORGANIZATION' ? (user.organizationCode ?? undefined) : undefined,
    permissions: new Set(role.permissions),
  };
  cache.set(email, acting);
  return acting;
}

/** Plausible values for any required input the seed didn't spell out. */
function fillInputs(t: WorkflowTransition, seed: CaseSeed, provided: Record<string, unknown>, at: Date, eff?: Date, n = 0) {
  const inputs: Record<string, unknown> = { ...provided };
  const year = at.getUTCFullYear();
  for (const input of t.inputs) {
    if (inputs[input.key] !== undefined) continue;
    if (input.key === t.effectiveDateInput) inputs[input.key] = isoDate(eff ?? at);
    else if (!input.required) continue;
    else if (input.type === 'date') inputs[input.key] = isoDate(at);
    else if (input.key === 'gazetteNumber') inputs[input.key] = `${seed.districtCode}/GAZ/${year}/${100 + ((seed.areaProposedHa * 7 + n) % 900) | 0}`;
    else if (input.key === 'awardNumber') inputs[input.key] = `AWD/${seed.districtCode}/${year}/${String(n + 1).padStart(3, '0')}`;
    else if (input.key === 'paidAmountCr') inputs[input.key] = Math.round(seed.areaProposedHa * 1.6) / 10;
    else if (input.key === 'areaPossessedHa') inputs[input.key] = seed.areaProposedHa;
    else if (input.key === 'familiesResettled') inputs[input.key] = seed.affectedFamiliesEstimate;
    else if (input.type === 'number') inputs[input.key] = 0;
    else inputs[input.key] = 'Recorded during synthetic data seeding';
  }
  return inputs;
}

/** Removes previously seeded demo cases (raw driver: history is otherwise undeletable by design). */
async function removeSeededCases() {
  const ids = (await Case.find({ seedKey: { $exists: true } }).select('_id').lean()).map((c) => c._id as Types.ObjectId);
  if (!ids.length) return;
  await CaseEvent.collection.deleteMany({ caseId: { $in: ids } });
  await Parcel.collection.deleteMany({ caseId: { $in: ids } });
  await Case.collection.deleteMany({ _id: { $in: ids } });
}

/** Survey numbers 41, 42, … per village: the mock cadastral layout centres that range on the village. */
const surveyRange = (count: number) => Array.from({ length: count }, (_, i) => String(41 + i));

/** About 1 in 25 parcels of a notified case is in dispute, so the map and later the alerts show some. */
async function markSomeDisputed(caseId: Types.ObjectId) {
  const parcels = await Parcel.find({ caseId, status: { $nin: ['PROPOSED'] } }).select('_id surveyNumber villageName').lean();
  const chosen = parcels.filter((p) => hash32(`dispute|${p.villageName}|${p.surveyNumber}`) % 25 === 0).map((p) => p._id);
  if (chosen.length) await Parcel.updateMany({ _id: { $in: chosen } }, { $set: { status: 'DISPUTED' } });
}

/**
 * Builds each demo case by replaying its history through the real workflow engine with backdated
 * timestamps, so seeded cases obey exactly the same rules (roles, inputs, dates) as live ones.
 */
export async function seedCases(now = new Date()): Promise<void> {
  await removeSeededCases();
  const users = new Map<string, ActingUser>();
  for (const seed of caseSeeds) {
    const { key, steps, createdBy, createdDaysAgo, parcels, ...input } = seed;
    const creator = await actingUser(createdBy, users);
    const created = await createCase({ ...input, villages: input.villages, urgency: input.urgency ?? false }, creator, daysAgo(createdDaysAgo, now));
    await Case.updateOne({ _id: created._id }, { $set: { seedKey: key } });

    let version = created.version;
    const wf = (await getWorkflow(created.workflowCode, created.workflowVersion)).content;
    let stage = created.currentStage;
    // The parcel import happens at its point in the timeline, so later transitions move the parcels on.
    const importBefore = parcels ? steps.findIndex((s) => s.daysAgo < parcels.daysAgo) : -1;
    const runImport = async () => {
      if (!parcels) return;
      const by = await actingUser(parcels.by, users);
      for (const village of input.villages) {
        await importParcels(String(created._id), { village, surveyNumbers: surveyRange(parcels.perVillage) }, by, daysAgo(parcels.daysAgo, now));
      }
      version = (await Case.findById(created._id).select('version').lean())!.version;
    };
    if (parcels && importBefore === -1 && steps.length === 0) await runImport();

    for (const [i, step] of steps.entries()) {
      if (i === importBefore) await runImport();
      const t = wf.transitions.find((x) => x.action === step.action && x.from.includes(stage));
      if (!t) throw new Error(`seed ${key}: no ${step.action} from ${stage}`);
      const at = daysAgo(step.daysAgo, now);
      const eff = step.effDaysAgo !== undefined ? daysAgo(step.effDaysAgo, now) : undefined;
      const updated = await transitionCase(
        String(created._id),
        {
          action: step.action,
          expectedVersion: version,
          remarks: step.remarks ?? (t.requiresRemarks ? 'Recorded during synthetic data seeding' : undefined),
          inputs: fillInputs(t, seed, step.inputs ?? {}, at, eff, i),
        },
        await actingUser(step.by, users),
        at,
      ).catch((err: Error) => {
        throw new Error(`seed case "${key}" step ${i + 1} (${step.action} by ${step.by}): ${err.message}`);
      });
      version = updated.version;
      stage = updated.currentStage;
    }
    if (parcels && importBefore === -1 && steps.length > 0) await runImport();
    await markSomeDisputed(created._id as Types.ObjectId);
  }
  logger.info({ cases: caseSeeds.length }, 'demo cases seeded');
}
