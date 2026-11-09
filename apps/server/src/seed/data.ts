// Seed data for North South University, taken from the Figma screens (docs/design/screens).
import { DEFAULT_APPEARANCE } from '@lf/contracts';
import { CATEGORIES, COLOURS } from '@lf/domain';
import type { CatalogSeed } from '../modules/catalog';
import type { MemberSeed } from '../modules/identity';

const academicFloors = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: i === 0 ? 'Ground floor' : `${ordinal(i)} floor`,
    zones: ['Classrooms', 'Labs', 'Corridor & stairs', 'Washrooms'],
  }));

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11
      ? 'st'
      : n % 10 === 2 && n !== 12
        ? 'nd'
        : n % 10 === 3 && n !== 13
          ? 'rd'
          : 'th';
  return `${n}${suffix}`;
}

export const NSU_CATALOG: CatalogSeed = {
  buildings: [
    { code: 'NAC', name: 'North Academic Building', floors: academicFloors(6) },
    { code: 'SAC', name: 'South Academic Building', floors: academicFloors(6) },
    {
      code: 'LIB',
      name: 'Library',
      floors: [
        { name: 'Ground floor', zones: ['Entrance & lockers', 'Circulation desk'] },
        { name: '1st floor', zones: ['Computer zone', 'Group study rooms'] },
        { name: '2nd floor', zones: ['Reading hall', 'Quiet study'] },
        { name: '3rd floor', zones: ['Stacks', 'Journals'] },
      ],
    },
    {
      code: 'ADM',
      name: 'Admin Building',
      floors: [
        { name: 'Ground floor', zones: ['Security Room', 'Accounts', 'Reception'] },
        { name: '1st floor', zones: ['Registrar', 'Offices'] },
      ],
    },
    {
      code: 'PLZ',
      name: 'Plaza & Food Court',
      floors: [{ name: 'Ground floor', zones: ['Food court', 'Plaza', 'Seating area'] }],
    },
    {
      code: 'AUD',
      name: 'Auditorium',
      floors: [{ name: 'Ground floor', zones: ['Foyer', 'Main hall', 'Green room'] }],
    },
    {
      code: 'GYM',
      name: 'Gym & Sports Complex',
      floors: [{ name: 'Ground floor', zones: ['Court', 'Gym floor', 'Changing rooms'] }],
    },
  ],
  // Plan §9.4: the office is in the Admin Building (the "Library LIB-012" text in one Figma card is wrong).
  desk: {
    code: 'LF-ADM',
    name: 'Lost & Found Office',
    buildingCode: 'ADM',
    location: 'Admin Building, Ground floor, Security Room',
    hours: 'Sun–Thu, 9:00 – 17:00',
    bins: ['A', 'B', 'C'].flatMap((shelf) =>
      [1, 2, 3, 4, 5, 6].map((n) => ({ code: `${shelf}${n}`, label: `Shelf ${shelf} · Bin ${n}` })),
    ),
  },
  categories: CATEGORIES,
  colours: COLOURS,
  policies: {
    appearance: DEFAULT_APPEARANCE,
    'lost_report.open_days': 30,
    'found_item.hand_in_hours': 48,
    'pickup.proxy_allowed': true,
  },
};

/** The people named in the Figma screens, one per role. Emails are fictional. */
export const NSU_MEMBERS: MemberSeed[] = [
  {
    email: 'rafiq.ahmed@northsouth.edu',
    name: 'Rafiq Ahmed',
    role: 'student',
    title: 'BSc Computer Science',
  },
  {
    email: 'nusrat.jahan@northsouth.edu',
    name: 'Nusrat Jahan',
    role: 'desk_officer',
    title: 'Desk officer',
  },
  {
    email: 'farhana.islam@northsouth.edu',
    name: 'Farhana Islam',
    role: 'supervisor',
    title: 'L&F supervisor',
  },
  {
    email: 'tanvir.alam@northsouth.edu',
    name: 'Tanvir Alam',
    role: 'it_admin',
    title: 'IT administrator',
  },
  {
    email: '8801700000001@visitors.lostfound.invalid',
    name: 'Karim Hossain',
    role: 'visitor',
    title: 'Visitor',
    phoneNumber: '+8801700000001',
  },
];

/** Bangladesh public holidays in the demo period (working-day calculations skip these). */
export const NSU_HOLIDAYS = [
  { date: '2026-12-16', name: 'Victory Day', kind: 'public_holiday' },
  { date: '2026-12-25', name: 'Christmas Day', kind: 'public_holiday' },
  { date: '2027-02-21', name: 'International Mother Language Day', kind: 'public_holiday' },
  { date: '2027-03-26', name: 'Independence Day', kind: 'public_holiday' },
] as const;

export const NSU_TENANT = {
  slug: 'nsu',
  name: 'North South University',
  shortName: 'NSU',
  emailDomain: 'northsouth.edu',
  hostnames: ['localhost', '127.0.0.1', 'nsu.localhost'],
  isPractice: false,
};

/** Practice mode (SRS desk UI): same people and catalog, sample records, its own address. */
export const NSU_PRACTICE_TENANT = {
  slug: 'nsu-practice',
  name: 'North South University (practice)',
  shortName: 'NSU practice',
  emailDomain: 'northsouth.edu',
  hostnames: ['practice.localhost'],
  isPractice: true,
};
