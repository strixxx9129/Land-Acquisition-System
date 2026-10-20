import type { LocalizedText, UserScope } from '@lams/shared';
import { Jurisdiction } from './jurisdiction.model.js';
import { Organization } from './organization.model.js';

const NATIONAL: LocalizedText = { en: 'All India', hi: 'संपूर्ण भारत' };

/** A human label for a user's jurisdiction, e.g. "Pune, Maharashtra". */
export async function scopeLabel(scope: UserScope): Promise<LocalizedText> {
  switch (scope.level) {
    case 'NATIONAL':
      return NATIONAL;
    case 'ORGANIZATION': {
      const org = await Organization.findOne({ code: scope.organizationCode }).lean();
      return (org?.name as LocalizedText | undefined) ?? { en: scope.organizationCode ?? 'Unknown organisation' };
    }
    case 'STATE':
    case 'DISTRICT': {
      const codes = [scope.stateCode, scope.districtCode].filter(Boolean) as string[];
      const units = await Jurisdiction.find({ code: { $in: codes } }).lean();
      const state = units.find((u) => u.code === scope.stateCode)?.name as LocalizedText | undefined;
      const district = units.find((u) => u.code === scope.districtCode)?.name as LocalizedText | undefined;
      if (scope.level === 'STATE' || !district) return state ?? { en: scope.stateCode ?? 'Unknown state' };
      const join = (lang: string) => [district[lang] ?? district.en, state?.[lang] ?? state?.en].filter(Boolean).join(', ');
      return { en: join('en'), hi: join('hi') };
    }
  }
}
