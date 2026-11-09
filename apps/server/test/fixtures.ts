// Two tenants with deliberately overlapping data (plan §5.3): the same building codes, the same
// people's names, and lost reports with the same IDs. Tenant B also has marker text that must
// never appear in a tenant-A response.
import type { MemberSeed } from '../src/modules/identity';

export const TENANT_A = {
  slug: 'nsu',
  name: 'North South University',
  shortName: 'NSU',
  emailDomain: 'northsouth.edu',
  hostnames: ['nsu.test'],
  isPractice: false,
};

export const TENANT_B = {
  slug: 'other',
  name: 'Other University B',
  shortName: 'OUB',
  emailDomain: 'other.test',
  hostnames: ['other.test'],
  isPractice: false,
};

export const HOST_A = 'nsu.test';
export const HOST_B = 'other.test';
export const ORIGIN = 'http://nsu.test';

const names = (domain: string, phone: string): MemberSeed[] => [
  {
    email: `rafiq.ahmed@${domain}`,
    name: 'Rafiq Ahmed',
    role: 'student',
    title: 'BSc Computer Science',
  },
  {
    email: `nusrat.jahan@${domain}`,
    name: 'Nusrat Jahan',
    role: 'desk_officer',
    title: 'Desk officer',
  },
  {
    email: `farhana.islam@${domain}`,
    name: 'Farhana Islam',
    role: 'supervisor',
    title: 'L&F supervisor',
  },
  {
    email: `tanvir.alam@${domain}`,
    name: 'Tanvir Alam',
    role: 'it_admin',
    title: 'IT administrator',
  },
  {
    email: `${phone.slice(1)}@visitors.lostfound.invalid`,
    name: 'Karim Hossain',
    role: 'visitor',
    title: 'Visitor',
    phoneNumber: phone,
  },
  { email: `second.student@${domain}`, name: 'Sadia Rahman', role: 'student', title: 'BBA' },
];

export const MEMBERS_A = names('northsouth.edu', '+8801700000001');
export const MEMBERS_B = names('other.test', '+8801700000099');

export const email = {
  student: 'rafiq.ahmed@northsouth.edu',
  student2: 'second.student@northsouth.edu',
  desk: 'nusrat.jahan@northsouth.edu',
  supervisor: 'farhana.islam@northsouth.edu',
  itAdmin: 'tanvir.alam@northsouth.edu',
  visitor: '8801700000001@visitors.lostfound.invalid',
  studentB: 'rafiq.ahmed@other.test',
} as const;

/** Text only tenant B's seeded report contains. */
export const TENANT_B_MARKER = 'OTHER-UNIVERSITY-ONLY';

/** "Now" in every API test: 8 Nov 2026, 16:39 in Dhaka (the time on the Figma screens). */
export const TEST_NOW = '2026-11-08T10:39:00.000Z';
