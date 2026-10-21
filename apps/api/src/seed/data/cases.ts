import type { ProjectType, PublicPurpose } from '@lams/shared';

export interface CaseStepSeed {
  action: string;
  by: string;
  /** When the action was taken, in days before the seed runs (dates stay relative to "today"). */
  daysAgo: number;
  /** Official date for transitions that record one (gazette, award, ...), in days before today. */
  effDaysAgo?: number;
  inputs?: Record<string, unknown>;
  remarks?: string;
}

export interface CaseSeed {
  key: string;
  title: string;
  workflowCode: string;
  projectType: ProjectType;
  publicPurpose: PublicPurpose;
  purpose: string;
  districtCode: string;
  organizationCode: string;
  areaProposedHa: number;
  estimatedCostCr: number;
  affectedFamiliesEstimate: number;
  villages: string[];
  urgency?: boolean;
  createdBy: string;
  createdDaysAgo: number;
  /** Parcels pulled from the (mock) land records for each of the case's villages, by an officer, at a point in the history. */
  parcels?: { by: string; daysAgo: number; perVillage: number };
  steps: CaseStepSeed[];
}

const NHAI = 'rb.nhai@demo.lams.test';
const LAO_PUNE = 'lao.pune@demo.lams.test';
const COLLECTOR_PUNE = 'collector.pune@demo.lams.test';
const STATE_MH = 'state.mh@demo.lams.test';

/**
 * Synthetic cases at different stages. Several are deliberately close to or past statutory limits
 * so the deadline indicators (and, in M5, alerts) have something to show.
 */
export const caseSeeds: CaseSeed[] = [
  {
    key: 'pune-ring-road',
    title: 'Pune Ring Road (Western Section) — Package 2',
    workflowCode: 'NH_ACT_1956',
    projectType: 'HIGHWAY',
    publicPurpose: 'INFRASTRUCTURE',
    purpose: 'Access-controlled six-lane ring road to divert through traffic away from Pune city and connect NH-48 with NH-65.',
    districtCode: '2701',
    organizationCode: 'NHAI',
    areaProposedHa: 186.4,
    estimatedCostCr: 2480,
    affectedFamiliesEstimate: 640,
    villages: ['Maan', 'Marunji', 'Nere', 'Jambe'],
    createdBy: NHAI,
    createdDaysAgo: 150,
    parcels: { by: LAO_PUNE, daysAgo: 145, perVillage: 12 },
    // 3A published 16 days ago: the 21-day objection window closes in 5 days.
    steps: [
      { action: 'SUBMIT', by: NHAI, daysAgo: 148 },
      { action: 'FORWARD_FOR_3A', by: LAO_PUNE, daysAgo: 140 },
      { action: 'PUBLISH_3A', by: LAO_PUNE, daysAgo: 15, effDaysAgo: 16 },
    ],
  },
  {
    key: 'chakan-midc',
    title: 'Chakan Industrial Area Phase V — expansion',
    workflowCode: 'RFCTLARR_2013',
    projectType: 'INDUSTRIAL',
    publicPurpose: 'INDUSTRIAL_CORRIDOR',
    purpose: 'Expansion of the Chakan auto cluster with common effluent treatment and logistics park.',
    districtCode: '2701',
    organizationCode: 'MIDC',
    areaProposedHa: 312,
    estimatedCostCr: 940,
    affectedFamiliesEstimate: 410,
    villages: ['Vasuli', 'Shinde', 'Varale'],
    createdBy: 'officer.midc@staff.lams.test',
    createdDaysAgo: 40,
    parcels: { by: LAO_PUNE, daysAgo: 20, perVillage: 15 },
    // In scrutiny for 22 days against a 15-day SLA.
    steps: [{ action: 'SUBMIT', by: 'officer.midc@staff.lams.test', daysAgo: 22 }],
  },
  {
    key: 'pune-nashik-rail',
    title: 'Pune–Nashik Semi High-Speed Rail — Khed section',
    workflowCode: 'RFCTLARR_2013',
    projectType: 'RAILWAY',
    publicPurpose: 'INFRASTRUCTURE',
    purpose: 'Double-line semi high-speed rail corridor between Pune and Nashik; Khed taluka stretch.',
    districtCode: '2701',
    organizationCode: 'RVNL',
    areaProposedHa: 228.7,
    estimatedCostCr: 3150,
    affectedFamiliesEstimate: 820,
    villages: ['Rajgurunagar', 'Chas', 'Kanhersar', 'Waki'],
    createdBy: 'officer.rvnl@staff.lams.test',
    createdDaysAgo: 700,
    parcels: { by: LAO_PUNE, daysAgo: 672, perVillage: 12 },
    // Preliminary notification 340 days ago: the 12-month declaration limit is close.
    steps: [
      { action: 'SUBMIT', by: 'officer.rvnl@staff.lams.test', daysAgo: 690 },
      { action: 'RETURN', by: LAO_PUNE, daysAgo: 684, remarks: '7/12 extracts missing for 14 survey numbers in Chas.' },
      { action: 'RESUBMIT', by: 'officer.rvnl@staff.lams.test', daysAgo: 676 },
      { action: 'FORWARD', by: LAO_PUNE, daysAgo: 670 },
      { action: 'RECOMMEND', by: COLLECTOR_PUNE, daysAgo: 662 },
      { action: 'APPROVE', by: STATE_MH, daysAgo: 640 },
      { action: 'SUBMIT_SIA', by: LAO_PUNE, daysAgo: 470, effDaysAgo: 472, inputs: { siaAgency: 'Gokhale Institute SIA Unit (synthetic)', affectedFamilies: 804 } },
      { action: 'ACCEPT_SIA', by: STATE_MH, daysAgo: 430, effDaysAgo: 431 },
      { action: 'PUBLISH_PRELIMINARY', by: LAO_PUNE, daysAgo: 339, effDaysAgo: 340 },
      { action: 'SUBMIT_HEARING_REPORT', by: LAO_PUNE, daysAgo: 268, inputs: { objectionsReceived: 37 } },
    ],
  },
  {
    key: 'nashik-sinnar',
    title: 'Nashik–Sinnar NH-160 four-laning',
    workflowCode: 'NH_ACT_1956',
    projectType: 'HIGHWAY',
    publicPurpose: 'INFRASTRUCTURE',
    purpose: 'Four-laning with paved shoulders, two bypasses and a ROB on the Nashik–Sinnar stretch.',
    districtCode: '2702',
    organizationCode: 'NHAI',
    areaProposedHa: 96.2,
    estimatedCostCr: 1120,
    affectedFamiliesEstimate: 290,
    villages: ['Shinde', 'Palse', 'Musalgaon'],
    createdBy: NHAI,
    createdDaysAgo: 400,
    parcels: { by: 'lao.nashik@staff.lams.test', daysAgo: 390, perVillage: 12 },
    steps: [
      { action: 'SUBMIT', by: NHAI, daysAgo: 395 },
      { action: 'FORWARD_FOR_3A', by: 'lao.nashik@staff.lams.test', daysAgo: 386 },
      { action: 'PUBLISH_3A', by: 'lao.nashik@staff.lams.test', daysAgo: 330, effDaysAgo: 331 },
      { action: 'DISPOSE_OBJECTIONS', by: 'lao.nashik@staff.lams.test', daysAgo: 300, inputs: { objectionsReceived: 12 } },
      { action: 'PUBLISH_3D', by: 'lao.nashik@staff.lams.test', daysAgo: 288, effDaysAgo: 289 },
    ],
  },
  {
    key: 'prayagraj-canal',
    title: 'Yamuna left-bank canal lining and distributaries',
    workflowCode: 'RFCTLARR_2013',
    projectType: 'IRRIGATION',
    publicPurpose: 'AGRO_PROCESSING',
    purpose: 'Lining of the main canal and two distributaries to cut seepage losses and extend irrigation to tail-end villages.',
    districtCode: '0902',
    organizationCode: 'UPIWRD',
    areaProposedHa: 74.5,
    estimatedCostCr: 210,
    affectedFamiliesEstimate: 160,
    villages: ['Bhita', 'Ghoorpur', 'Iradatganj'],
    createdBy: 'officer.upiwrd@staff.lams.test',
    createdDaysAgo: 260,
    parcels: { by: 'lao.prayagraj@staff.lams.test', daysAgo: 250, perVillage: 10 },
    // SIA running for 200 days against a 6-month limit.
    steps: [
      { action: 'SUBMIT', by: 'officer.upiwrd@staff.lams.test', daysAgo: 255 },
      { action: 'FORWARD', by: 'lao.prayagraj@staff.lams.test', daysAgo: 241 },
      { action: 'RECOMMEND', by: 'collector.prayagraj@staff.lams.test', daysAgo: 232 },
      { action: 'APPROVE', by: 'state.up@demo.lams.test', daysAgo: 200 },
    ],
  },
  {
    key: 'khordha-industrial',
    title: 'Khordha Industrial Park — Phase II',
    workflowCode: 'RFCTLARR_2013',
    projectType: 'INDUSTRIAL',
    publicPurpose: 'INDUSTRIAL_CORRIDOR',
    purpose: 'Plug-and-play industrial park for MSMEs with a skill development centre.',
    districtCode: '2101',
    organizationCode: 'IDCO',
    areaProposedHa: 142,
    estimatedCostCr: 520,
    affectedFamiliesEstimate: 230,
    villages: ['Jatni', 'Baghamari', 'Tangi'],
    urgency: true,
    createdBy: 'officer.idco@staff.lams.test',
    createdDaysAgo: 820,
    parcels: { by: 'lao.khordha@staff.lams.test', daysAgo: 810, perVillage: 14 },
    // Award 130 days ago: compensation is overdue under section 38.
    steps: [
      { action: 'SUBMIT', by: 'officer.idco@staff.lams.test', daysAgo: 815 },
      { action: 'FORWARD', by: 'lao.khordha@staff.lams.test', daysAgo: 805 },
      { action: 'RECOMMEND', by: 'collector.khordha@staff.lams.test', daysAgo: 795 },
      { action: 'APPROVE_SIA_EXEMPT', by: 'state.od@staff.lams.test', daysAgo: 780, remarks: 'Exempted under section 10A (industrial corridor) by State notification.' },
      { action: 'PUBLISH_PRELIMINARY', by: 'lao.khordha@staff.lams.test', daysAgo: 699, effDaysAgo: 700 },
      { action: 'SUBMIT_HEARING_REPORT', by: 'lao.khordha@staff.lams.test', daysAgo: 640, inputs: { objectionsReceived: 21 } },
      { action: 'PUBLISH_DECLARATION', by: 'state.od@staff.lams.test', daysAgo: 399, effDaysAgo: 400 },
      { action: 'DECLARE_AWARD', by: 'collector.khordha@staff.lams.test', daysAgo: 129, effDaysAgo: 130, inputs: { awardAmountCr: 96.4 } },
    ],
  },
  {
    key: 'pune-satara-junctions',
    title: 'Pune–Satara NH-48 service roads and junction improvements',
    workflowCode: 'NH_ACT_1956',
    projectType: 'HIGHWAY',
    publicPurpose: 'INFRASTRUCTURE',
    purpose: 'Service roads, two vehicular underpasses and junction redesign at Khed Shivapur and Shindewadi.',
    districtCode: '2701',
    organizationCode: 'NHAI',
    areaProposedHa: 18.6,
    estimatedCostCr: 310,
    affectedFamiliesEstimate: 75,
    villages: ['Khed Shivapur', 'Shindewadi'],
    createdBy: NHAI,
    createdDaysAgo: 3,
    // Left as a draft so the requiring body can submit it live during the demo.
    steps: [],
  },
  {
    key: 'agra-outer-ring',
    title: 'Agra Outer Ring Road — Phase I',
    workflowCode: 'NH_ACT_1956',
    projectType: 'HIGHWAY',
    publicPurpose: 'INFRASTRUCTURE',
    purpose: 'Outer ring road linking the Yamuna Expressway and the Agra–Lucknow Expressway.',
    districtCode: '0903',
    organizationCode: 'NHAI',
    areaProposedHa: 212.3,
    estimatedCostCr: 1890,
    affectedFamiliesEstimate: 530,
    villages: ['Rohta', 'Kakua', 'Iradatnagar'],
    createdBy: NHAI,
    createdDaysAgo: 980,
    parcels: { by: 'lao.agra@staff.lams.test', daysAgo: 970, perVillage: 14 },
    steps: [
      { action: 'SUBMIT', by: NHAI, daysAgo: 975 },
      { action: 'FORWARD_FOR_3A', by: 'lao.agra@staff.lams.test', daysAgo: 962 },
      { action: 'PUBLISH_3A', by: 'lao.agra@staff.lams.test', daysAgo: 920, effDaysAgo: 921 },
      { action: 'DISPOSE_OBJECTIONS', by: 'lao.agra@staff.lams.test', daysAgo: 893, inputs: { objectionsReceived: 44 } },
      { action: 'PUBLISH_3D', by: 'lao.agra@staff.lams.test', daysAgo: 700, effDaysAgo: 701 },
      { action: 'DECLARE_AWARD', by: 'lao.agra@staff.lams.test', daysAgo: 560, effDaysAgo: 561, inputs: { awardAmountCr: 402.5 } },
      { action: 'COMPLETE_DISBURSEMENT', by: 'finance.agra@staff.lams.test', daysAgo: 480, inputs: { paidAmountCr: 371.2, depositedInCourtCr: 31.3 } },
      { action: 'COMPLETE_RR', by: 'rr.agra@staff.lams.test', daysAgo: 400, inputs: { familiesResettled: 512 } },
      { action: 'TAKE_POSSESSION', by: 'collector.agra@staff.lams.test', daysAgo: 360, effDaysAgo: 362 },
    ],
  },
];
