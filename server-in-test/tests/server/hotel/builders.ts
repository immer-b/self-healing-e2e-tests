import { addDays, createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';
import type { EmployeeInput, OwnerInput, PetInput, RoomInput, Role } from '../../../src/server/hotel/types';

export const BUILDER_TODAY = '2026-11-20';
export const DESK = { id: 'emp-desk', name: 'Front Desk' };

let counter = 0;
const unique = (prefix: string) => `${prefix}${++counter}`;

/**
 * An empty hotel plus builders that create valid records with sensible defaults, creating
 * whatever they depend on. Tests state only what matters to them instead of relying on seed ids.
 *
 *   const h = givenHotel();
 *   const stay = h.stay({ nights: 3, status: 'checked_in' });
 */
export function givenHotel({ today = BUILDER_TODAY, time = '08:00:00' } = {}) {
  const clock = createClock(new Date(`${today}T${time}`));
  const hotel = createHotel({ clock, seed: false });
  const ok = <T>(outcome: { ok: boolean; value?: T; error?: string; errors?: unknown }): T => {
    if (!outcome.ok) throw new Error(`builder failed: ${outcome.error} ${JSON.stringify(outcome.errors ?? {})}`);
    return outcome.value!;
  };

  const builders = {
    hotel,
    clock,
    today,
    room: (overrides: Partial<RoomInput> = {}) =>
      ok(hotel.rooms.create({ name: unique('R-'), type: 'basic', nightlyRate: 45, ...overrides }, DESK)),
    owner: (overrides: Partial<OwnerInput> = {}) =>
      ok(
        hotel.owners.create(
          {
            name: unique('Owner '),
            email: '',
            address: { line1: '1 Main St', line2: '', city: 'Portland', state: 'OR', postalCode: '97201' },
            contacts: [{ name: 'Contact', relationship: 'Owner', phones: [{ label: 'Mobile', number: '503-555-0100' }] }],
            ...overrides,
          },
          DESK,
        ),
      ),
    pet: (overrides: Partial<PetInput> = {}) =>
      ok(
        hotel.pets.create(
          { name: unique('Pet '), species: 'dog', breed: 'Mutt', specialInstructions: '', ...overrides, ownerId: overrides.ownerId ?? builders.owner().id },
          DESK,
        ),
      ),
    staff: (overrides: Partial<EmployeeInput> & { role?: Role } = {}) =>
      ok(
        hotel.employees.create(
          { name: unique('Staff '), username: unique('user'), email: '', phone: '', role: 'staff', type: 'maintenance', password: 'staff1234', ...overrides },
          DESK,
        ),
      ),
    /** A stay starting `startsIn` days from today for `nights` nights; checked in when asked (moving the clock if needed). */
    stay: ({
      petId,
      roomId,
      startsIn = 0,
      nights = 2,
      status = 'booked',
    }: { petId?: string; roomId?: string; startsIn?: number; nights?: number; status?: 'booked' | 'checked_in' } = {}) => {
      const checkIn = addDays(today, startsIn);
      const realNow = clock.now();
      if (startsIn < 0) clock.set(new Date(`${checkIn}T08:00:00`)); // bookings can't start in the past
      const stay = ok(
        hotel.stays.book({ petId: petId ?? builders.pet().id, roomId: roomId ?? builders.room().id, checkIn, checkOut: addDays(checkIn, nights) }, DESK),
      );
      if (status === 'checked_in') {
        if (startsIn > 0) throw new Error('cannot check in a future stay');
        if (startsIn === 0) clock.set(new Date(`${checkIn}T08:00:00`));
        ok(hotel.stays.checkIn(stay.id, DESK));
      }
      clock.set(realNow);
      return hotel.stays.get(stay.id)!;
    },
  };
  return builders;
}
