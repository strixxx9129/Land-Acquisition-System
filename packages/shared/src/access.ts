import { z } from 'zod';
import type { LocalizedText } from './i18n.js';

/**
 * Jurisdiction levels a role can be scoped to. Which level a role uses, and
 * which permissions it holds, is data (the `roles` collection), not code.
 */
export const SCOPE_LEVELS = ['NATIONAL', 'STATE', 'DISTRICT', 'ORGANIZATION'] as const;
export const scopeLevelSchema = z.enum(SCOPE_LEVELS);
export type ScopeLevel = z.infer<typeof scopeLevelSchema>;

interface PermissionDef {
  code: string;
  group: string;
  label: LocalizedText;
}

/**
 * The capabilities the code knows how to enforce. Roles reference these codes;
 * the admin decides which role gets which capability.
 */
export const PERMISSIONS = [
  { code: 'admin.roles.manage', group: 'admin', label: { en: 'Manage roles and permissions', hi: 'भूमिकाएँ और अनुमतियाँ प्रबंधित करें' } },
  { code: 'admin.users.read', group: 'admin', label: { en: 'View users', hi: 'उपयोगकर्ता देखें' } },
  { code: 'admin.users.manage', group: 'admin', label: { en: 'Manage users', hi: 'उपयोगकर्ता प्रबंधित करें' } },
  { code: 'workflow.config.manage', group: 'admin', label: { en: 'Configure workflows and rules', hi: 'कार्यप्रवाह और नियम कॉन्फ़िगर करें' } },
  { code: 'masters.read', group: 'masters', label: { en: 'View master data', hi: 'मास्टर डेटा देखें' } },
  { code: 'case.read', group: 'case', label: { en: 'View acquisition cases', hi: 'अधिग्रहण प्रकरण देखें' } },
  { code: 'case.create', group: 'case', label: { en: 'Submit proposals', hi: 'प्रस्ताव प्रस्तुत करें' } },
  { code: 'case.transition', group: 'case', label: { en: 'Act on cases in workflow', hi: 'कार्यप्रवाह में प्रकरणों पर कार्रवाई करें' } },
  { code: 'parcel.read', group: 'parcel', label: { en: 'View land parcels', hi: 'भूखंड देखें' } },
  { code: 'parcel.write', group: 'parcel', label: { en: 'Edit land parcels', hi: 'भूखंड संपादित करें' } },
  { code: 'parcel.field_verify', group: 'parcel', label: { en: 'Field-verify parcels', hi: 'भूखंडों का क्षेत्र सत्यापन करें' } },
  { code: 'award.manage', group: 'finance', label: { en: 'Prepare awards', hi: 'अवार्ड तैयार करें' } },
  { code: 'payment.manage', group: 'finance', label: { en: 'Manage disbursements', hi: 'भुगतान प्रबंधित करें' } },
  { code: 'pii.reveal', group: 'finance', label: { en: 'Reveal masked personal data', hi: 'छिपा हुआ व्यक्तिगत डेटा देखें' } },
  { code: 'rr.manage', group: 'rr', label: { en: 'Manage R&R and families', hi: 'पुनर्वास और परिवार प्रबंधित करें' } },
  { code: 'possession.manage', group: 'possession', label: { en: 'Record possession and milestones', hi: 'कब्ज़ा और माइलस्टोन दर्ज करें' } },
  { code: 'document.read', group: 'document', label: { en: 'View documents', hi: 'दस्तावेज़ देखें' } },
  { code: 'document.upload', group: 'document', label: { en: 'Upload documents', hi: 'दस्तावेज़ अपलोड करें' } },
  { code: 'dashboard.read', group: 'insight', label: { en: 'View dashboards', hi: 'डैशबोर्ड देखें' } },
  { code: 'report.export', group: 'insight', label: { en: 'Export MIS reports', hi: 'एमआईएस रिपोर्ट निर्यात करें' } },
  { code: 'analytics.read', group: 'insight', label: { en: 'View predictive analytics', hi: 'पूर्वानुमान विश्लेषण देखें' } },
  { code: 'alert.read', group: 'insight', label: { en: 'View alerts', hi: 'अलर्ट देखें' } },
] as const satisfies readonly PermissionDef[];

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];
export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code) as [PermissionCode, ...PermissionCode[]];
export const permissionCodeSchema = z.enum(PERMISSION_CODES);

export const userScopeSchema = z.object({
  level: scopeLevelSchema,
  stateCode: z.string().optional(),
  districtCode: z.string().optional(),
  organizationCode: z.string().optional(),
});
export type UserScope = z.infer<typeof userScopeSchema>;
