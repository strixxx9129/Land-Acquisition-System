import type { LocalizedText } from '@lams/shared';

export interface JurisdictionSeed {
  code: string;
  level: 'STATE' | 'DISTRICT';
  name: LocalizedText;
  stateCode: string;
  districtCode?: string;
  parentCode?: string;
  /** [longitude, latitude] */
  centroid: [number, number];
  syntheticCode: boolean;
}

const state = (code: string, en: string, hi: string, centroid: [number, number]): JurisdictionSeed => ({
  code,
  level: 'STATE',
  name: { en, hi },
  stateCode: code,
  centroid,
  syntheticCode: false,
});

// District codes are synthetic placeholders (flagged), to be replaced by real LGD codes via the LGD adapter.
const district = (stateCode: string, code: string, en: string, hi: string, centroid: [number, number]): JurisdictionSeed => ({
  code,
  level: 'DISTRICT',
  name: { en, hi },
  stateCode,
  districtCode: code,
  parentCode: stateCode,
  centroid,
  syntheticCode: true,
});

/** State codes follow LGD/Census 2011 numbering. */
export const jurisdictionSeeds: JurisdictionSeed[] = [
  state('27', 'Maharashtra', 'महाराष्ट्र', [75.71, 19.75]),
  district('27', '2701', 'Pune', 'पुणे', [73.8567, 18.5204]),
  district('27', '2702', 'Nashik', 'नाशिक', [73.7898, 19.9975]),
  district('27', '2703', 'Chhatrapati Sambhajinagar', 'छत्रपति संभाजीनगर', [75.3433, 19.8762]),
  district('27', '2704', 'Nagpur', 'नागपुर', [79.0882, 21.1458]),

  state('09', 'Uttar Pradesh', 'उत्तर प्रदेश', [80.95, 26.85]),
  district('09', '0901', 'Lucknow', 'लखनऊ', [80.9462, 26.8467]),
  district('09', '0902', 'Prayagraj', 'प्रयागराज', [81.8463, 25.4358]),
  district('09', '0903', 'Agra', 'आगरा', [78.0081, 27.1767]),
  district('09', '0904', 'Gorakhpur', 'गोरखपुर', [83.3732, 26.7606]),

  state('21', 'Odisha', 'ओडिशा', [85.1, 20.95]),
  district('21', '2101', 'Khordha', 'खोर्धा', [85.62, 20.18]),
  district('21', '2102', 'Cuttack', 'कटक', [85.883, 20.4625]),
  district('21', '2103', 'Ganjam', 'गंजाम', [84.7941, 19.315]),
  district('21', '2104', 'Jajpur', 'जाजपुर', [86.33, 20.85]),
];
