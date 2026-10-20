import mongoose, { Schema } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { runAs, runAsSystem, ScopeError, type UserActor } from '../src/modules/access/context.js';
import { jurisdictionScoped } from '../src/modules/access/scopePlugin.js';

// A stand-in for cases/parcels: any collection that carries jurisdiction keys.
const thingSchema = new Schema({ label: String, stateCode: String, districtCode: String, organizationCode: String });
jurisdictionScoped(thingSchema, { state: 'stateCode', district: 'districtCode', organization: 'organizationCode' });
const Thing = mongoose.model('ScopedThing', thingSchema);

// A collection with no organisation key: organisation-scoped users must see nothing in it.
const masterSchema = new Schema({ label: String, stateCode: String, districtCode: String });
jurisdictionScoped(masterSchema, { state: 'stateCode', district: 'districtCode' });
const DistrictOnly = mongoose.model('DistrictOnlyThing', masterSchema);

const actor = (scope: UserActor['scope']): UserActor => ({ kind: 'user', userId: '000000000000000000000001', roleCode: 'TEST', scope, permissions: new Set() });
const pune = actor({ level: 'DISTRICT', stateCode: '27', districtCode: '2701' });
const maharashtra = actor({ level: 'STATE', stateCode: '27' });
const national = actor({ level: 'NATIONAL' });
const nhai = actor({ level: 'ORGANIZATION', organizationCode: 'NHAI' });

let nashikId: string;

beforeAll(async () => {
  await runAsSystem('test', async () => {
    const docs = await Thing.insertMany([
      { label: 'pune-nhai', stateCode: '27', districtCode: '2701', organizationCode: 'NHAI' },
      { label: 'pune-midc', stateCode: '27', districtCode: '2701', organizationCode: 'MIDC' },
      { label: 'nashik-nhai', stateCode: '27', districtCode: '2702', organizationCode: 'NHAI' },
      { label: 'lucknow-irr', stateCode: '09', districtCode: '0901', organizationCode: 'UPIWRD' },
    ]);
    nashikId = String(docs[2]!._id);
    await DistrictOnly.create({ label: 'm', stateCode: '27', districtCode: '2701' });
  });
});

const labels = (docs: { label?: string | null }[]) => docs.map((d) => d.label).sort();

describe('jurisdiction scoping', () => {
  it('denies any query made without an actor', async () => {
    await expect(Thing.find().lean()).rejects.toBeInstanceOf(ScopeError);
  });

  it('limits a district user to their district', async () => {
    const docs = await runAs(pune, () => Thing.find().lean());
    expect(labels(docs)).toEqual(['pune-midc', 'pune-nhai']);
  });

  it('limits a state user to their state', async () => {
    const docs = await runAs(maharashtra, () => Thing.find().lean());
    expect(labels(docs)).toEqual(['nashik-nhai', 'pune-midc', 'pune-nhai']);
  });

  it('gives national users everything', async () => {
    expect(await runAs(national, () => Thing.countDocuments())).toBe(4);
  });

  it('limits a requiring body to its own organisation', async () => {
    const docs = await runAs(nhai, () => Thing.find().lean());
    expect(labels(docs)).toEqual(['nashik-nhai', 'pune-nhai']);
  });

  it('shows nothing when the collection has no key for the user\'s level (deny by default)', async () => {
    expect(await runAs(nhai, () => DistrictOnly.countDocuments())).toBe(0);
  });

  it('hides another district\'s record even when fetched by id', async () => {
    expect(await runAs(pune, () => Thing.findById(nashikId).lean())).toBeNull();
  });

  it('does not let a district user update another district\'s record', async () => {
    const res = await runAs(pune, () => Thing.updateOne({ _id: nashikId }, { $set: { label: 'hacked' } }));
    expect(res.matchedCount).toBe(0);
    const doc = await runAsSystem('test', () => Thing.findById(nashikId).lean());
    expect(doc?.label).toBe('nashik-nhai');
  });

  it('does not let a district user delete another district\'s record', async () => {
    const res = await runAs(pune, () => Thing.deleteOne({ _id: nashikId }));
    expect(res.deletedCount).toBe(0);
  });

  it('refuses to create a record in another district', async () => {
    await expect(runAs(pune, () => Thing.create({ label: 'x', stateCode: '27', districtCode: '2702' }))).rejects.toBeInstanceOf(ScopeError);
  });

  it('allows creating a record in the user\'s own district', async () => {
    const doc = await runAs(pune, () => Thing.create({ label: 'own', stateCode: '27', districtCode: '2701' }));
    expect(doc.label).toBe('own');
  });

  it('refuses to move a record out of the user\'s district', async () => {
    await expect(
      runAs(pune, () => Thing.updateOne({ label: 'own' }, { $set: { districtCode: '2702' } })),
    ).rejects.toBeInstanceOf(ScopeError);
  });

  it('refuses insertMany with an out-of-scope document', async () => {
    await expect(
      runAs(pune, () => Thing.insertMany([{ label: 'a', stateCode: '27', districtCode: '2701' }, { label: 'b', stateCode: '09', districtCode: '0901' }])),
    ).rejects.toBeInstanceOf(ScopeError);
  });

  it('scopes aggregation pipelines', async () => {
    const rows = await runAs(maharashtra, () => Thing.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$stateCode', n: { $sum: 1 } } }]));
    expect(rows.map((r) => r._id)).toEqual(['27']);
  });

  it('restricts bulkWrite to the system', async () => {
    await expect(runAs(national, () => Thing.bulkWrite([{ deleteMany: { filter: {} } }]))).rejects.toBeInstanceOf(ScopeError);
  });
});
