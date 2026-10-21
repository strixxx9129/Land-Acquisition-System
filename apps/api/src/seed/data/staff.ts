import type { DemoUserSeed } from './users.js';

/**
 * Additional synthetic officers who appear in seeded case histories. They cannot sign in (random
 * password) and are not listed as demo logins.
 */
export const staffSeeds: DemoUserSeed[] = [
  { name: 'Sanjay Bhosale', email: 'lao.nashik@staff.lams.test', roleCode: 'LAND_ACQUISITION_OFFICER', designation: 'Competent Authority (LA), Nashik', stateCode: '27', districtCode: '2702' },
  { name: 'Kavita Rane', email: 'officer.midc@staff.lams.test', roleCode: 'REQUIRING_BODY', designation: 'Executive Engineer (Land), MIDC', organizationCode: 'MIDC' },
  { name: 'Deepak Malhotra', email: 'officer.rvnl@staff.lams.test', roleCode: 'REQUIRING_BODY', designation: 'Chief Project Manager, RVNL', organizationCode: 'RVNL' },
  { name: 'Ravi Shankar Tiwari', email: 'officer.upiwrd@staff.lams.test', roleCode: 'REQUIRING_BODY', designation: 'Superintending Engineer, Irrigation', organizationCode: 'UPIWRD' },
  { name: 'Pooja Mishra', email: 'lao.prayagraj@staff.lams.test', roleCode: 'LAND_ACQUISITION_OFFICER', designation: 'Special Land Acquisition Officer, Prayagraj', stateCode: '09', districtCode: '0902' },
  { name: 'Anand Kumar Singh', email: 'collector.prayagraj@staff.lams.test', roleCode: 'DISTRICT_COLLECTOR', designation: 'District Magistrate, Prayagraj', stateCode: '09', districtCode: '0902' },
  { name: 'Nitin Agarwal', email: 'lao.agra@staff.lams.test', roleCode: 'LAND_ACQUISITION_OFFICER', designation: 'Competent Authority (LA), Agra', stateCode: '09', districtCode: '0903' },
  { name: 'Shalini Gupta', email: 'collector.agra@staff.lams.test', roleCode: 'DISTRICT_COLLECTOR', designation: 'District Magistrate, Agra', stateCode: '09', districtCode: '0903' },
  { name: 'Mohit Chauhan', email: 'finance.agra@staff.lams.test', roleCode: 'FINANCE_OFFICER', designation: 'Disbursing Officer, Agra', stateCode: '09', districtCode: '0903' },
  { name: 'Rekha Yadav', email: 'rr.agra@staff.lams.test', roleCode: 'RR_OFFICER', designation: 'R&R Administrator, Agra', stateCode: '09', districtCode: '0903' },
  { name: 'Subhashree Mohanty', email: 'state.od@staff.lams.test', roleCode: 'STATE_NODAL_OFFICER', designation: 'State Nodal Officer, Revenue & DM Dept', stateCode: '21' },
  { name: 'Prakash Nayak', email: 'lao.khordha@staff.lams.test', roleCode: 'LAND_ACQUISITION_OFFICER', designation: 'Land Acquisition Officer, Khordha', stateCode: '21', districtCode: '2101' },
  { name: 'Bijay Kumar Sahoo', email: 'collector.khordha@staff.lams.test', roleCode: 'DISTRICT_COLLECTOR', designation: 'Collector, Khordha', stateCode: '21', districtCode: '2101' },
  { name: 'Lipika Das', email: 'officer.idco@staff.lams.test', roleCode: 'REQUIRING_BODY', designation: 'General Manager (Land), IDCO', organizationCode: 'IDCO' },
];
