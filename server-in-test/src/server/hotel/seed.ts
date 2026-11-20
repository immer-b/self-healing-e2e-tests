import type { Actor } from './auditLog';
import { addDays, type IsoDate } from './clock';
import type { Hotel, HotelStores } from './hotel';
import { hashPassword } from './passwords';
import type { EmployeeInput, OwnerInput, PetInput, RoomInput, StayStatus } from './types';

export const SYSTEM_ACTOR: Actor = { id: 'system', name: 'System' };

/** Demo sign-ins, also listed in server-in-test/README.md. */
export const SEED_ACCOUNTS = {
  admin: { username: 'admin', password: 'password123' },
  receiving: { username: 'frontdesk', password: 'frontdesk123' },
  staff: { username: 'jordan', password: 'staff123' },
} as const;

type SeedEmployee = EmployeeInput & { password: string; archived?: boolean };

const EMPLOYEES: SeedEmployee[] = [
  { name: 'Morgan Reyes', username: 'admin', email: 'morgan.reyes@willowpets.test', phone: '503-555-0110', role: 'admin', type: 'front_desk', password: 'password123' },
  { name: 'Priya Shah', username: 'frontdesk', email: 'priya.shah@willowpets.test', phone: '503-555-0111', role: 'receiving', type: 'front_desk', password: 'frontdesk123' },
  { name: 'Jordan Lee', username: 'jordan', email: 'jordan.lee@willowpets.test', phone: '503-555-0112', role: 'staff', type: 'maintenance', password: 'staff123' },
  { name: 'Sam Rivera', username: 'sam', email: 'sam.rivera@willowpets.test', phone: '503-555-0113', role: 'staff', type: 'maintenance', password: 'staff123' },
  { name: 'Alex Chen', username: 'alex', email: 'alex.chen@willowpets.test', phone: '503-555-0114', role: 'staff', type: 'front_desk', password: 'staff123' },
  { name: 'Riley Park', username: 'riley', email: 'riley.park@willowpets.test', phone: '', role: 'staff', type: 'maintenance', password: 'staff123', archived: true },
];

const ROOMS: RoomInput[] = [
  { name: 'E-101', type: 'exclusive', nightlyRate: 120 },
  { name: 'E-102', type: 'exclusive', nightlyRate: 120 },
  ...[201, 202, 203, 204].map((n) => ({ name: `M-${n}`, type: 'midline' as const, nightlyRate: 75 })),
  ...[301, 302, 303, 304, 305, 306].map((n) => ({ name: `B-${n}`, type: 'basic' as const, nightlyRate: 45 })),
];

const address = (line1: string, city: string, postalCode: string) => ({ line1, line2: '', city, state: 'OR', postalCode });

const OWNERS: OwnerInput[] = [
  {
    name: 'Dana Whitfield',
    email: 'dana.whitfield@example.com',
    address: address('1428 SE Elm St', 'Portland', '97214'),
    contacts: [
      { name: 'Dana Whitfield', relationship: 'Owner', phones: [{ label: 'Mobile', number: '(503) 555-0101' }] },
      { name: 'Sam Whitfield', relationship: 'Spouse', phones: [{ label: 'Mobile', number: '(503) 555-0102' }, { label: 'Work', number: '(503) 555-0199' }] },
    ],
  },
  {
    name: 'Marcus Bell',
    email: 'marcus.bell@example.com',
    address: address('88 NW Lovejoy St, Apt 4B', 'Portland', '97209'),
    contacts: [
      { name: 'Marcus Bell', relationship: 'Owner', phones: [{ label: 'Mobile', number: '(971) 555-0123' }, { label: 'Home', number: '(503) 555-0124' }] },
      { name: 'Ellie Bell', relationship: 'Daughter', phones: [{ label: 'Mobile', number: '(971) 555-0125' }] },
    ],
  },
  {
    name: 'Sofia Alvarez',
    email: 'sofia.alvarez@example.com',
    address: address('230 Main St', 'Beaverton', '97005'),
    contacts: [
      { name: 'Sofia Alvarez', relationship: 'Owner', phones: [{ label: 'Mobile', number: '(503) 555-0131' }] },
      { name: 'Dr. Hannah Cole', relationship: 'Veterinarian', phones: [{ label: 'Clinic', number: '(503) 555-0170' }] },
    ],
  },
  {
    name: 'Kenji Watanabe',
    email: 'kenji.w@example.com',
    address: address('19 Oak Ridge Rd', 'Lake Oswego', '97034'),
    contacts: [
      { name: 'Kenji Watanabe', relationship: 'Owner', phones: [{ label: 'Mobile', number: '(503) 555-0141' }] },
      { name: 'Aiko Watanabe', relationship: 'Spouse', phones: [{ label: 'Mobile', number: '(503) 555-0142' }] },
    ],
  },
  {
    name: "Grace O'Neill",
    email: '',
    address: address('7 Birch Ln', 'Tigard', '97223'),
    contacts: [
      { name: "Grace O'Neill", relationship: 'Owner', phones: [{ label: 'Home', number: '(503) 555-0151' }] },
      { name: "Liam O'Neill", relationship: 'Neighbor (emergency)', phones: [{ label: 'Mobile', number: '(503) 555-0152' }] },
    ],
  },
];

// ownerIndex is 0-based into OWNERS.
// Vaccination expiry is given in days from today so the seed never goes stale.
type SeedPet = Omit<PetInput, 'ownerId' | 'vaccinations'> & { ownerIndex: number; vaccinations?: { name: string; expiresIn: number }[] };
const PETS: SeedPet[] = [
  { name: 'Biscuit', dateOfBirth: '2020-05-14', weightLbs: 28, vet: { name: 'Eastside Animal Clinic', phone: '(503) 555-0175' }, vaccinations: [{ name: 'Rabies', expiresIn: 162 }, { name: 'DHPP', expiresIn: 56 }, { name: 'Bordetella', expiresIn: 15 }],  species: 'dog', breed: 'Beagle', ownerIndex: 0, specialInstructions: 'Grain-free kibble, 1 cup twice daily. Pulls on the leash.' },
  { name: 'Mochi', dateOfBirth: '2019-09-02', weightLbs: 9, vaccinations: [{ name: 'Rabies', expiresIn: 110 }, { name: 'FVRCP', expiresIn: 110 }],  species: 'cat', breed: 'Siamese', ownerIndex: 0, specialInstructions: 'Wet food only. Hides when nervous, approach slowly.' },
  { name: 'Duke', dateOfBirth: '2016-02-20', weightLbs: 82, vet: { name: 'Pearl District Vet', phone: '(503) 555-0180' }, vaccinations: [{ name: 'Rabies', expiresIn: -5 }, { name: 'DHPP', expiresIn: 73 }],  species: 'dog', breed: 'German Shepherd', ownerIndex: 1, specialInstructions: 'Hip dysplasia: 1 carprofen tablet with breakfast.' },
  { name: 'Luna', dateOfBirth: '2022-07-08', weightLbs: 61, vet: { name: 'Dr. Hannah Cole', phone: '(503) 555-0170' }, vaccinations: [{ name: 'Rabies', expiresIn: 223 }, { name: 'Bordetella', expiresIn: 61 }],  species: 'dog', breed: 'Golden Retriever', ownerIndex: 2, specialInstructions: 'Allergic to chicken. Check treats.' },
  { name: 'Pepper', species: 'cat', breed: 'Maine Coon', ownerIndex: 3, specialInstructions: '' },
  { name: 'Rocky', species: 'dog', breed: 'French Bulldog', ownerIndex: 3, specialInstructions: 'Brachycephalic: no exercise in the heat. Water bowl always full.' },
  { name: 'Hazel', species: 'other', breed: 'Holland Lop rabbit', ownerIndex: 4, specialInstructions: 'Unlimited timothy hay. Fresh greens in the evening.' },
  { name: 'Max', species: 'dog', breed: 'Labrador Retriever', ownerIndex: 1, specialInstructions: '' },
];

// [petIndex, roomName, checkIn offset, checkOut offset, status]
const STAYS: [number, string, number, number, StayStatus][] = [
  [0, 'E-101', -2, 2, 'checked_in'],
  [1, 'M-201', -2, 2, 'checked_in'],
  [2, 'E-102', -3, 0, 'checked_in'], // leaves today
  [3, 'M-202', -1, 0, 'checked_in'], // leaves today
  [4, 'B-301', 0, 3, 'booked'], // arrives today
  [5, 'B-302', 0, 4, 'booked'], // arrives today
  [6, 'M-203', 1, 5, 'booked'],
  [7, 'B-303', -10, -7, 'checked_out'], // past guest
];

const passwordHashes = new Map<string, string>();
const hashOnce = (password: string) => {
  if (!passwordHashes.has(password)) passwordHashes.set(password, hashPassword(password));
  return passwordHashes.get(password)!;
};

/**
 * Demo data relative to `today`: two guests leaving, two arriving, two mid-stay, one booked for
 * tomorrow and one past guest, plus today's care rounds already spread across the staff.
 */
export function seedHotel({ hotel, store, today }: { hotel: Hotel; store: HotelStores; today: IsoDate }) {
  const actor = SYSTEM_ACTOR;

  for (const { password, archived, ...employee } of EMPLOYEES) {
    const created = store.employees.create({ ...employee, passwordHash: hashOnce(password), mustChangePassword: false }, actor);
    if (archived) store.employees.remove(created.id, actor);
  }

  const rooms = ROOMS.map((room) => hotel.rooms.create(room, actor).value!);
  const owners = OWNERS.map((owner) => hotel.owners.create(owner, actor).value!);
  const pets = PETS.map(({ ownerIndex, vaccinations = [], ...pet }) =>
    hotel.pets.create(
      { ...pet, ownerId: owners[ownerIndex].id, vaccinations: vaccinations.map((v) => ({ name: v.name, expiresOn: addDays(today, v.expiresIn) })) },
      actor,
    ).value!,
  );

  for (const [petIndex, roomName, inOffset, outOffset, status] of STAYS) {
    const roomId = rooms.find((r) => r.name === roomName)!.id;
    store.stays.create(
      { petId: pets[petIndex].id, roomId, checkIn: addDays(today, inOffset), checkOut: addDays(today, outOffset), status },
      actor,
    );
  }

  const jordan = { id: 'emp-3', name: 'Jordan Lee' };
  const sam = { id: 'emp-4', name: 'Sam Rivera' };
  store.notes.create({ petId: pets[0].id, text: 'Settled in well. Ate all of his dinner.', taskId: null, amends: null }, jordan);
  store.notes.create({ petId: pets[2].id, text: 'Slight stiffness getting up this morning; gave carprofen with breakfast as instructed.', taskId: null, amends: null }, sam);
  store.notes.create({ petId: pets[1].id, text: 'Hid under the bed most of the evening. Ate about half of her food.', taskId: null, amends: null }, jordan);

  hotel.tasks.generate(today, undefined, { id: 'emp-2', name: 'Priya Shah' });
}
