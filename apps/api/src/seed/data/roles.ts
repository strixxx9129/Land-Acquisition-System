import { PERMISSION_CODES, type LocalizedText, type PermissionCode, type ScopeLevel } from '@lams/shared';

export interface RoleSeed {
  code: string;
  name: LocalizedText;
  description: LocalizedText;
  scopeLevel: ScopeLevel;
  permissions: PermissionCode[];
}

const VIEW: PermissionCode[] = ['masters.read', 'case.read', 'parcel.read', 'document.read', 'alert.read'];

/** Starting roles. Admins edit these at runtime (Admin → Roles); re-seeding restores them. */
export const roleSeeds: RoleSeed[] = [
  {
    code: 'SYSTEM_ADMIN',
    name: { en: 'System Administrator', hi: 'सिस्टम प्रशासक' },
    description: { en: 'Configures workflows, rules, roles and users', hi: 'कार्यप्रवाह, नियम, भूमिकाएँ और उपयोगकर्ता कॉन्फ़िगर करते हैं' },
    scopeLevel: 'NATIONAL',
    permissions: [...PERMISSION_CODES],
  },
  {
    code: 'MINISTRY_OFFICER',
    name: { en: 'Ministry Officer (DoLR)', hi: 'मंत्रालय अधिकारी (भूमि संसाधन विभाग)' },
    description: { en: 'National monitoring and policy decisions', hi: 'राष्ट्रीय निगरानी और नीतिगत निर्णय' },
    scopeLevel: 'NATIONAL',
    permissions: [...VIEW, 'dashboard.read', 'report.export', 'analytics.read', 'admin.users.read'],
  },
  {
    code: 'STATE_NODAL_OFFICER',
    name: { en: 'State Nodal Officer', hi: 'राज्य नोडल अधिकारी' },
    description: { en: 'Approves and monitors cases across the state', hi: 'राज्य भर के प्रकरणों का अनुमोदन और निगरानी' },
    scopeLevel: 'STATE',
    permissions: [...VIEW, 'case.transition', 'document.upload', 'dashboard.read', 'report.export', 'analytics.read', 'admin.users.read'],
  },
  {
    code: 'DISTRICT_COLLECTOR',
    name: { en: 'District Collector', hi: 'जिला कलेक्टर' },
    description: { en: 'Leads acquisition in the district and declares awards', hi: 'जिले में अधिग्रहण का नेतृत्व और अवार्ड घोषित करते हैं' },
    scopeLevel: 'DISTRICT',
    permissions: [
      ...VIEW,
      'case.transition',
      'parcel.write',
      'award.manage',
      'possession.manage',
      'document.upload',
      'dashboard.read',
      'report.export',
      'analytics.read',
      'admin.users.read',
    ],
  },
  {
    code: 'LAND_ACQUISITION_OFFICER',
    name: { en: 'Land Acquisition Officer', hi: 'भूमि अधिग्रहण अधिकारी' },
    description: { en: 'Processes cases, parcels, notifications and awards', hi: 'प्रकरण, भूखंड, अधिसूचनाएँ और अवार्ड संसाधित करते हैं' },
    scopeLevel: 'DISTRICT',
    permissions: [...VIEW, 'case.transition', 'parcel.write', 'award.manage', 'possession.manage', 'document.upload', 'dashboard.read'],
  },
  {
    code: 'RR_OFFICER',
    name: { en: 'R&R Officer', hi: 'पुनर्वास एवं पुनर्स्थापन अधिकारी' },
    description: { en: 'Registers affected families and delivers entitlements', hi: 'प्रभावित परिवारों का पंजीकरण और पात्रताओं का वितरण' },
    scopeLevel: 'DISTRICT',
    permissions: [...VIEW, 'case.transition', 'rr.manage', 'document.upload', 'dashboard.read'],
  },
  {
    code: 'FIELD_OFFICER',
    name: { en: 'Field Officer', hi: 'क्षेत्र अधिकारी' },
    description: { en: 'Geo-tags and verifies parcels on site', hi: 'मौके पर भूखंडों का जियो-टैग और सत्यापन' },
    scopeLevel: 'DISTRICT',
    permissions: [...VIEW, 'parcel.field_verify', 'document.upload'],
  },
  {
    code: 'FINANCE_OFFICER',
    name: { en: 'Disbursement Officer', hi: 'भुगतान अधिकारी' },
    description: { en: 'Releases compensation to beneficiaries', hi: 'लाभार्थियों को मुआवज़ा जारी करते हैं' },
    scopeLevel: 'DISTRICT',
    permissions: [...VIEW, 'case.transition', 'payment.manage', 'pii.reveal', 'document.upload', 'dashboard.read'],
  },
  {
    code: 'REQUIRING_BODY',
    name: { en: 'Land Requiring Body', hi: 'भूमि अपेक्षी निकाय' },
    description: { en: 'Proposes projects and tracks their acquisition', hi: 'परियोजनाएँ प्रस्तावित करते हैं और अधिग्रहण की प्रगति देखते हैं' },
    scopeLevel: 'ORGANIZATION',
    permissions: [...VIEW, 'case.create', 'case.transition', 'document.upload', 'dashboard.read'],
  },
];
