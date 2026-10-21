import { z } from 'zod';
import type { LocalizedText } from './i18n.js';

export const PROJECT_TYPES = [
  { code: 'HIGHWAY', label: { en: 'Highway', hi: 'राजमार्ग' } },
  { code: 'RAILWAY', label: { en: 'Railway', hi: 'रेलवे' } },
  { code: 'IRRIGATION', label: { en: 'Irrigation', hi: 'सिंचाई' } },
  { code: 'INDUSTRIAL', label: { en: 'Industrial corridor / park', hi: 'औद्योगिक गलियारा / पार्क' } },
  { code: 'URBAN', label: { en: 'Urban development', hi: 'शहरी विकास' } },
  { code: 'ENERGY', label: { en: 'Energy / transmission', hi: 'ऊर्जा / पारेषण' } },
] as const satisfies readonly { code: string; label: LocalizedText }[];
export type ProjectType = (typeof PROJECT_TYPES)[number]['code'];
export const projectTypeSchema = z.enum(PROJECT_TYPES.map((p) => p.code) as [ProjectType, ...ProjectType[]]);

/** Public purpose categories under section 2(1) of the RFCTLARR Act, 2013 (abridged). */
export const PUBLIC_PURPOSES = [
  { code: 'STRATEGIC', label: { en: 'Strategic / defence / national security', hi: 'सामरिक / रक्षा / राष्ट्रीय सुरक्षा' } },
  { code: 'INFRASTRUCTURE', label: { en: 'Infrastructure project', hi: 'अवसंरचना परियोजना' } },
  { code: 'INDUSTRIAL_CORRIDOR', label: { en: 'Industrial corridor / manufacturing zone', hi: 'औद्योगिक गलियारा / विनिर्माण क्षेत्र' } },
  { code: 'AGRO_PROCESSING', label: { en: 'Agro-processing / irrigation', hi: 'कृषि-प्रसंस्करण / सिंचाई' } },
  { code: 'HOUSING', label: { en: 'Housing for weaker sections / displaced', hi: 'कमज़ोर वर्ग / विस्थापितों हेतु आवास' } },
  { code: 'PLANNED_DEVELOPMENT', label: { en: 'Planned development of village / urban sites', hi: 'ग्राम / नगर स्थलों का नियोजित विकास' } },
] as const satisfies readonly { code: string; label: LocalizedText }[];
export type PublicPurpose = (typeof PUBLIC_PURPOSES)[number]['code'];
export const publicPurposeSchema = z.enum(PUBLIC_PURPOSES.map((p) => p.code) as [PublicPurpose, ...PublicPurpose[]]);

/** ACTIVE while in a non-terminal stage; otherwise the terminal stage's outcome. */
export const CASE_STATUSES = ['ACTIVE', 'COMPLETED', 'REJECTED', 'WITHDRAWN', 'LAPSED'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

// No defaults here: a partial update must only touch the fields actually sent.
const proposalFields = z.object({
  title: z.string().trim().min(5).max(200),
  projectType: projectTypeSchema,
  publicPurpose: publicPurposeSchema,
  purpose: z.string().trim().min(10).max(4000),
  areaProposedHa: z.number().positive().max(100_000),
  estimatedCostCr: z.number().nonnegative().max(1_000_000).optional(),
  affectedFamiliesEstimate: z.number().int().nonnegative().max(1_000_000).optional(),
  villages: z.array(z.string().trim().min(1).max(100)).max(200),
  urgency: z.boolean(),
});

export const proposalSchema = proposalFields.extend({
  villages: proposalFields.shape.villages.default([]),
  urgency: proposalFields.shape.urgency.default(false),
});

export const createCaseSchema = proposalSchema.extend({
  workflowCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,59}$/),
  districtCode: z.string().min(1).max(20),
  /** Required only when the creator is not itself a requiring body. */
  organizationCode: z.string().min(1).max(20).optional(),
});
export type CreateCaseInput = z.input<typeof createCaseSchema>;

export const updateProposalSchema = proposalFields.partial().extend({ expectedVersion: z.number().int().nonnegative() }).strict();

export const transitionRequestSchema = z.object({
  action: z.string().regex(/^[A-Z][A-Z0-9_]{1,59}$/),
  /** The case version the user was looking at. A mismatch means someone else acted first. */
  expectedVersion: z.number().int().nonnegative(),
  remarks: z.string().trim().max(4000).optional(),
  inputs: z.record(z.string(), z.unknown()).default({}),
});
export type TransitionRequest = z.input<typeof transitionRequestSchema>;
