import type { LocalizedText } from '@lams/shared';

export interface OrganizationSeed {
  code: string;
  name: LocalizedText;
  type: string;
  level: 'CENTRAL' | 'STATE';
  stateCode?: string;
}

export const organizationSeeds: OrganizationSeed[] = [
  { code: 'NHAI', name: { en: 'National Highways Authority of India', hi: 'भारतीय राष्ट्रीय राजमार्ग प्राधिकरण' }, type: 'HIGHWAY', level: 'CENTRAL' },
  { code: 'RVNL', name: { en: 'Rail Vikas Nigam Limited', hi: 'रेल विकास निगम लिमिटेड' }, type: 'RAILWAY', level: 'CENTRAL' },
  {
    code: 'MIDC',
    name: { en: 'Maharashtra Industrial Development Corporation', hi: 'महाराष्ट्र औद्योगिक विकास महामंडळ' },
    type: 'INDUSTRIAL',
    level: 'STATE',
    stateCode: '27',
  },
  {
    code: 'UPIWRD',
    name: { en: 'Irrigation & Water Resources Department, Uttar Pradesh', hi: 'सिंचाई एवं जल संसाधन विभाग, उत्तर प्रदेश' },
    type: 'IRRIGATION',
    level: 'STATE',
    stateCode: '09',
  },
  {
    code: 'IDCO',
    name: { en: 'Odisha Industrial Infrastructure Development Corporation', hi: 'ओडिशा औद्योगिक अवसंरचना विकास निगम' },
    type: 'INDUSTRIAL',
    level: 'STATE',
    stateCode: '21',
  },
];
