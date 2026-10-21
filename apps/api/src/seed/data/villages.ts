/**
 * Villages used by the demo cases. Names are real places; coordinates are approximate village
 * centres; codes are synthetic placeholders (flagged) until replaced via the LGD adapter.
 */
export interface VillageSeed {
  districtCode: string;
  en: string;
  hi: string;
  /** [longitude, latitude] */
  at: [number, number];
}

export const villageSeeds: VillageSeed[] = [
  // Pune (2701)
  { districtCode: '2701', en: 'Maan', hi: 'माण', at: [73.7, 18.598] },
  { districtCode: '2701', en: 'Marunji', hi: 'मारुंजी', at: [73.722, 18.611] },
  { districtCode: '2701', en: 'Nere', hi: 'नेरे', at: [73.708, 18.629] },
  { districtCode: '2701', en: 'Jambe', hi: 'जांबे', at: [73.686, 18.618] },
  { districtCode: '2701', en: 'Vasuli', hi: 'वासुली', at: [73.807, 18.773] },
  { districtCode: '2701', en: 'Shinde', hi: 'शिंदे', at: [73.823, 18.79] },
  { districtCode: '2701', en: 'Varale', hi: 'वराळे', at: [73.835, 18.758] },
  { districtCode: '2701', en: 'Rajgurunagar', hi: 'राजगुरुनगर', at: [73.884, 18.858] },
  { districtCode: '2701', en: 'Chas', hi: 'चास', at: [73.905, 18.882] },
  { districtCode: '2701', en: 'Kanhersar', hi: 'कन्हेरसर', at: [73.948, 18.823] },
  { districtCode: '2701', en: 'Waki', hi: 'वाकी', at: [73.918, 18.806] },
  { districtCode: '2701', en: 'Khed Shivapur', hi: 'खेड शिवापूर', at: [73.875, 18.333] },
  { districtCode: '2701', en: 'Shindewadi', hi: 'शिंदेवाडी', at: [73.866, 18.372] },
  { districtCode: '2701', en: 'Talegaon', hi: 'तळेगाव', at: [73.676, 18.735] },
  // Nashik (2702)
  { districtCode: '2702', en: 'Shinde', hi: 'शिंदे', at: [73.853, 19.93] },
  { districtCode: '2702', en: 'Palse', hi: 'पळसे', at: [73.878, 19.917] },
  { districtCode: '2702', en: 'Musalgaon', hi: 'मुसळगाव', at: [73.995, 19.873] },
  // Prayagraj (0902)
  { districtCode: '0902', en: 'Bhita', hi: 'भीटा', at: [81.795, 25.372] },
  { districtCode: '0902', en: 'Ghoorpur', hi: 'घूरपुर', at: [81.87, 25.33] },
  { districtCode: '0902', en: 'Iradatganj', hi: 'इरादतगंज', at: [81.946, 25.302] },
  // Agra (0903)
  { districtCode: '0903', en: 'Rohta', hi: 'रोहता', at: [77.968, 27.123] },
  { districtCode: '0903', en: 'Kakua', hi: 'ककुआ', at: [77.912, 27.135] },
  { districtCode: '0903', en: 'Iradatnagar', hi: 'इरादतनगर', at: [77.902, 27.052] },
  // Khordha (2101)
  { districtCode: '2101', en: 'Jatni', hi: 'जटनी', at: [85.707, 20.165] },
  { districtCode: '2101', en: 'Baghamari', hi: 'बाघमारी', at: [85.535, 20.105] },
  { districtCode: '2101', en: 'Tangi', hi: 'टांगी', at: [85.392, 19.928] },
];
