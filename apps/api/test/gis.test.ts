import { beforeAll, describe, expect, it } from 'vitest';
import { areaHa, deviationPct } from '../src/lib/geo.js';
import { runAsSystem } from '../src/modules/access/context.js';
import { Case } from '../src/modules/cases/case.model.js';
import { integrations, IntegrationError, type LandRecordsAdapter } from '../src/modules/integrations/index.js';
import { syntheticGeometry } from '../src/modules/integrations/mock/synthetic.js';
import { Parcel } from '../src/modules/parcels/parcel.model.js';
import { asUser, login } from './helpers.js';

type Client = ReturnType<typeof asUser>;
let laoPune: Client, collectorNashik: Client, ministry: Client, nhai: Client, admin: Client, fieldPune: Client;

beforeAll(async () => {
  const as = async (u: string) => asUser((await login(`${u}@demo.lams.test`)).token);
  laoPune = await as('lao.pune');
  collectorNashik = await as('collector.nashik');
  ministry = await as('ministry');
  nhai = await as('rb.nhai');
  admin = await as('admin');
  fieldPune = await as('field.pune');
});

const seededCaseId = (key: string) => runAsSystem('test', async () => String((await Case.findOne({ seedKey: key }).select('_id').lean())!._id));

/** A fresh case of NHAI in Pune, submitted so the LAO can import parcels. */
async function submittedPuneCase() {
  const created = await nhai.post('/api/cases', {
    title: 'GIS test corridor',
    projectType: 'HIGHWAY',
    publicPurpose: 'INFRASTRUCTURE',
    purpose: 'Corridor used by the GIS tests.',
    areaProposedHa: 20,
    workflowCode: 'NH_ACT_1956',
    districtCode: '2701',
  });
  await nhai.post(`/api/cases/${created.body.id}/transitions`, { action: 'SUBMIT', expectedVersion: created.body.version });
  return created.body.id as string;
}

describe('area measurement', () => {
  it('measures a 100 m × 100 m square near Pune as about 1 hectare', () => {
    const d = 100 / 111_320;
    const lngD = 100 / (111_320 * Math.cos((18.5 * Math.PI) / 180));
    const square = { type: 'Polygon' as const, coordinates: [[[73.8, 18.5], [73.8 + lngD, 18.5], [73.8 + lngD, 18.5 + d], [73.8, 18.5 + d], [73.8, 18.5]] as [number, number][]] };
    expect(areaHa(square)).toBeCloseTo(1, 1);
  });

  it('reports deviation as a percentage of the recorded area', () => {
    expect(deviationPct(2, 2.2)).toBe(10);
    expect(deviationPct(2, 1.9)).toBe(5);
  });

  it('generates stable synthetic geometry for the same survey number', () => {
    const key = { stateCode: '27', districtCode: '2701', villageName: 'Maan', surveyNumber: '45' };
    expect(syntheticGeometry(key, [73.7, 18.598])).toEqual(syntheticGeometry(key, [73.7, 18.598]));
  });
});

describe('importing parcels from land records', () => {
  it('creates parcels with geometry, owners and an area check, and records it in case history', async () => {
    const id = await submittedPuneCase();
    const res = await laoPune.post(`/api/cases/${id}/parcels/import`, { village: 'Talegaon', surveyNumbers: ['41', '42', '43', '44', '45'] });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(5);

    const list = await laoPune.get(`/api/cases/${id}/parcels`);
    expect(list.body.totals.parcels).toBe(5);
    const p = list.body.items[0];
    expect(p).toMatchObject({ villageName: 'Talegaon', status: 'PROPOSED' });
    expect(p.ulpin).toMatch(/^27[0-9A-Z]{12}$/);
    expect(p.owners.reduce((s: number, o: { share: number }) => s + o.share, 0)).toBeCloseTo(1, 5);
    expect(p.mapAreaHa).toBeGreaterThan(0.5);

    const detail = await laoPune.get(`/api/cases/${id}`);
    expect(detail.body.events.at(-1)).toMatchObject({ action: 'PARCELS_IMPORTED', inputs: { village: 'Talegaon', created: 5 } });
  });

  it('skips survey numbers already imported and reports missing records', async () => {
    const id = await submittedPuneCase();
    await laoPune.post(`/api/cases/${id}/parcels/import`, { village: 'Talegaon', surveyNumbers: ['41', '42'] });
    const res = await laoPune.post(`/api/cases/${id}/parcels/import`, { village: 'Talegaon', surveyNumbers: ['42', '43', '0'] });
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toEqual(['42']);
    expect(res.body.failed).toEqual([{ surveyNumber: '0', reason: 'Not found in land records' }]);
  });

  it('returns 502 when the land records service is down for every requested record', async () => {
    const id = await submittedPuneCase();
    const res = await laoPune.post(`/api/cases/${id}/parcels/import`, { village: 'Talegaon', surveyNumbers: ['9991', '9992'] });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('INTEGRATION_FAILED');
  });

  it('works with any adapter that implements the interface', async () => {
    const original = integrations.landRecords();
    const failing: LandRecordsAdapter = {
      name: 'Test portal',
      getRecord: async () => {
        throw new IntegrationError('Test portal', 'maintenance window');
      },
    };
    integrations.override({ landRecords: failing });
    try {
      const id = await submittedPuneCase();
      const res = await laoPune.post(`/api/cases/${id}/parcels/import`, { village: 'Talegaon', surveyNumbers: ['50'] });
      expect(res.status).toBe(502);
    } finally {
      integrations.override({ landRecords: original });
    }
  });

  it('rejects a village outside the case\'s district and lists the valid ones', async () => {
    const id = await submittedPuneCase();
    const res = await laoPune.post(`/api/cases/${id}/parcels/import`, { village: 'Palse', surveyNumbers: ['41'] });
    expect(res.status).toBe(400);
    expect(res.body.error.details.knownVillages).toContain('Talegaon');
  });

  it('requires parcel.write', async () => {
    const id = await submittedPuneCase();
    expect((await fieldPune.post(`/api/cases/${id}/parcels/import`, { village: 'Talegaon', surveyNumbers: ['41'] })).status).toBe(403);
  });
});

describe('parcels follow the case through the workflow', () => {
  it('moves proposed parcels to NOTIFIED when the 3A notification is recorded', async () => {
    const id = await submittedPuneCase();
    await laoPune.post(`/api/cases/${id}/parcels/import`, { village: 'Talegaon', surveyNumbers: ['41', '42', '43'] });
    const act = async (action: string, inputs?: object) => {
      const v = (await laoPune.get(`/api/cases/${id}`)).body.version;
      return laoPune.post(`/api/cases/${id}/transitions`, { action, expectedVersion: v, inputs });
    };
    await act('FORWARD_FOR_3A');
    await act('PUBLISH_3A', { gazetteNumber: 'S.O. 9', notificationDate: new Date().toISOString().slice(0, 10) });
    const list = await laoPune.get(`/api/cases/${id}/parcels`);
    expect(list.body.items.map((p: { status: string }) => p.status)).toEqual(['NOTIFIED', 'NOTIFIED', 'NOTIFIED']);
  });

  it('shows the seeded completed case with possession taken (except disputed parcels)', async () => {
    const id = await seededCaseId('agra-outer-ring');
    const list = await ministry.get(`/api/cases/${id}/parcels`);
    const statuses = new Set(list.body.items.map((p: { status: string }) => p.status));
    expect([...statuses].every((s) => s === 'POSSESSED' || s === 'DISPUTED')).toBe(true);
    expect(statuses.has('POSSESSED')).toBe(true);
  });
});

describe('area mismatch flags use the admin-configured tolerance', () => {
  it('flags more parcels when the tolerance is tightened, without recomputing anything', async () => {
    const id = await seededCaseId('pune-ring-road');
    const before = (await laoPune.get(`/api/cases/${id}/parcels`)).body.totals.mismatches;
    expect((await admin.put('/api/settings/gis.areaTolerancePct', { value: 0.5 })).status).toBe(200);
    const after = (await laoPune.get(`/api/cases/${id}/parcels`)).body.totals.mismatches;
    expect(after).toBeGreaterThan(before);
    await admin.put('/api/settings/gis.areaTolerancePct', { value: 5 });
  });

  it('validates setting values and restricts who can change them', async () => {
    expect((await admin.put('/api/settings/gis.areaTolerancePct', { value: 500 })).status).toBe(400);
    expect((await laoPune.put('/api/settings/gis.areaTolerancePct', { value: 1 })).status).toBe(403);
  });
});

describe('map queries', () => {
  const PUNE_RING_BBOX = '73.6,18.55,73.8,18.7';

  it('returns parcels intersecting the viewport as GeoJSON', async () => {
    const res = await laoPune.get(`/api/gis/parcels?bbox=${PUNE_RING_BBOX}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features.length).toBeGreaterThan(20);
    expect(res.body.features[0].geometry.type).toBe('Polygon');
    expect(res.body.features[0].properties).toHaveProperty('caseNumber');
  });

  it('returns nothing for an empty part of the map', async () => {
    const res = await laoPune.get('/api/gis/parcels?bbox=70.0,10.0,70.1,10.1');
    expect(res.body.features).toEqual([]);
  });

  it('never returns another district\'s parcels, whatever the viewport', async () => {
    const res = await collectorNashik.get(`/api/gis/parcels?bbox=${PUNE_RING_BBOX}`);
    expect(res.body.features).toEqual([]);
    const all = await collectorNashik.get('/api/gis/parcels?bbox=68,6,98,37');
    expect(all.body.features.length).toBeGreaterThan(0);
    const ids = all.body.features.map((f: { id: string }) => f.id);
    const districts = await runAsSystem('test', async () => new Set((await Parcel.find({ _id: { $in: ids } }).select('districtCode').lean()).map((p) => p.districtCode)));
    expect([...districts]).toEqual(['2702']);
  });

  it('rejects a malformed viewport', async () => {
    expect((await laoPune.get('/api/gis/parcels?bbox=1,2,3')).status).toBe(400);
    expect((await laoPune.get('/api/gis/parcels?bbox=74,19,73,18')).status).toBe(400);
  });

  it('drills down national → state → district with jurisdiction applied', async () => {
    const national = (await ministry.get('/api/gis/summary?level=national')).body;
    expect(national.items.map((i: { code: string }) => i.code).sort()).toEqual(['09', '21', '27']);
    const mh = national.items.find((i: { code: string }) => i.code === '27');
    expect(mh.parcels).toBeGreaterThan(100);
    expect(mh.name.en).toBe('Maharashtra');

    const districts = (await ministry.get('/api/gis/summary?level=state&code=27')).body.items.map((i: { code: string }) => i.code).sort();
    expect(districts).toEqual(['2701', '2702']);

    const cases = (await ministry.get('/api/gis/summary?level=district&code=2701')).body.items;
    expect(cases.every((i: { kind: string }) => i.kind === 'CASE')).toBe(true);
    expect(cases.some((i: { bbox: unknown }) => Array.isArray(i.bbox))).toBe(true);

    // A Nashik collector asking for the national view only sees their own district's numbers.
    const scoped = (await collectorNashik.get('/api/gis/summary?level=national')).body.items;
    expect(scoped.map((i: { code: string }) => i.code)).toEqual(['27']);
    expect(scoped[0].parcels).toBeLessThan(mh.parcels);
  });

  it('hides another district\'s parcel detail', async () => {
    const pune = (await laoPune.get(`/api/gis/parcels?bbox=${PUNE_RING_BBOX}`)).body.features[0].id;
    expect((await laoPune.get(`/api/parcels/${pune}`)).status).toBe(200);
    expect((await collectorNashik.get(`/api/parcels/${pune}`)).status).toBe(404);
  });
});
