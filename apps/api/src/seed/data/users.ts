export interface DemoUserSeed {
  name: string;
  email: string;
  roleCode: string;
  designation: string;
  stateCode?: string;
  districtCode?: string;
  organizationCode?: string;
}

/**
 * One demo login per role (all synthetic people), all sharing DEMO_USER_PASSWORD.
 * Two collectors in different districts make the jurisdiction isolation easy to demonstrate.
 */
export const demoUserSeeds: DemoUserSeed[] = [
  { name: 'Asha Verma', email: 'admin@demo.lams.test', roleCode: 'SYSTEM_ADMIN', designation: 'System Administrator, DoLR' },
  { name: 'Rakesh Menon', email: 'ministry@demo.lams.test', roleCode: 'MINISTRY_OFFICER', designation: 'Joint Secretary (LA), DoLR' },
  { name: 'Sunita Patil', email: 'state.mh@demo.lams.test', roleCode: 'STATE_NODAL_OFFICER', designation: 'State Nodal Officer, Revenue Dept', stateCode: '27' },
  { name: 'Alok Srivastava', email: 'state.up@demo.lams.test', roleCode: 'STATE_NODAL_OFFICER', designation: 'State Nodal Officer, Revenue Dept', stateCode: '09' },
  { name: 'Vikram Deshmukh', email: 'collector.pune@demo.lams.test', roleCode: 'DISTRICT_COLLECTOR', designation: 'Collector, Pune', stateCode: '27', districtCode: '2701' },
  { name: 'Meera Pawar', email: 'collector.nashik@demo.lams.test', roleCode: 'DISTRICT_COLLECTOR', designation: 'Collector, Nashik', stateCode: '27', districtCode: '2702' },
  { name: 'Neha Kulkarni', email: 'lao.pune@demo.lams.test', roleCode: 'LAND_ACQUISITION_OFFICER', designation: 'Special Land Acquisition Officer, Pune', stateCode: '27', districtCode: '2701' },
  { name: 'Imran Shaikh', email: 'rr.pune@demo.lams.test', roleCode: 'RR_OFFICER', designation: 'R&R Administrator, Pune', stateCode: '27', districtCode: '2701' },
  { name: 'Ganesh Jadhav', email: 'field.pune@demo.lams.test', roleCode: 'FIELD_OFFICER', designation: 'Circle Officer, Pune', stateCode: '27', districtCode: '2701' },
  { name: 'Priya Joshi', email: 'finance.pune@demo.lams.test', roleCode: 'FINANCE_OFFICER', designation: 'Disbursing Officer, Pune', stateCode: '27', districtCode: '2701' },
  { name: 'Arjun Rao', email: 'rb.nhai@demo.lams.test', roleCode: 'REQUIRING_BODY', designation: 'Project Director, NHAI', organizationCode: 'NHAI' },
];
