import { describe, expect, it } from 'vitest';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel, type Hotel } from '../../../src/server/hotel/hotel';
import { hashPassword, verifyPassword } from '../../../src/server/hotel/passwords';
import type { OwnerInput } from '../../../src/server/hotel/types';

const TODAY = '2026-11-20';
const admin = { id: 'emp-admin', name: 'Morgan Reyes' };

const ownerInput: OwnerInput = {
  name: 'Dana Whitfield',
  email: 'dana@example.com',
  address: { line1: '12 Elm St', line2: '', city: 'Portland', state: 'OR', postalCode: '97201' },
  contacts: [{ name: 'Dana Whitfield', relationship: 'Owner', phones: [{ label: 'Mobile', number: '503-555-0101' }] }],
};

/** An empty hotel (no seed) with one room, one owner and one pet. */
function emptyHotel() {
  const clock = createClock(new Date(`${TODAY}T08:00:00`));
  const hotel = createHotel({ clock, seed: false });
  const room = hotel.rooms.create({ name: 'E-101', type: 'exclusive', nightlyRate: 120 }, admin);
  const owner = hotel.owners.create(ownerInput, admin);
  const pet = hotel.pets.create(
    { name: 'Biscuit', species: 'dog', breed: 'Beagle', ownerId: owner.value!.id, specialInstructions: 'Grain-free food' },
    admin,
  );
  return { clock, hotel, room: room.value!, owner: owner.value!, pet: pet.value! };
}

const addStaff = (hotel: Hotel, username: string, role: 'staff' | 'receiving' | 'admin' = 'staff') =>
  hotel.employees.create(
    { name: username.toUpperCase(), username, email: '', phone: '', role, type: 'maintenance', password: 'staff123' },
    admin,
  ).value!;

describe('passwords', () => {
  it('hashes with a random salt and verifies', () => {
    const a = hashPassword('secret123');
    const b = hashPassword('secret123');
    expect(a).not.toBe(b);
    expect(a).not.toContain('secret123');
    expect(verifyPassword('secret123', a)).toBe(true);
    expect(verifyPassword('wrong', a)).toBe(false);
    expect(verifyPassword('secret123', 'garbage')).toBe(false);
  });
});

describe('employees', () => {
  it('never exposes password hashes and authenticates by username', () => {
    const { hotel } = emptyHotel();
    const jordan = addStaff(hotel, 'jordan');
    expect(jordan).not.toHaveProperty('passwordHash');
    expect(hotel.employees.list()[0]).not.toHaveProperty('passwordHash');
    expect(hotel.employees.authenticate('jordan', 'staff123')).toMatchObject({ id: jordan.id, role: 'staff' });
    expect(hotel.employees.authenticate('JORDAN', 'staff123')).toMatchObject({ id: jordan.id });
    expect(hotel.employees.authenticate('jordan', 'nope')).toBeUndefined();
  });

  it('requires a valid password when creating and rejects duplicate usernames, even archived ones', () => {
    const { hotel } = emptyHotel();
    const base = { name: 'A', username: 'alex', email: '', phone: '', role: 'staff' as const, type: 'maintenance' as const };
    expect(hotel.employees.create({ ...base, password: 'short' }, admin)).toMatchObject({
      ok: false,
      status: 400,
      errors: { password: 'must be at least 8 characters' },
    });
    const alex = hotel.employees.create({ ...base, password: 'longenough' }, admin).value!;
    hotel.employees.remove(alex.id, admin);
    expect(hotel.employees.create({ ...base, password: 'longenough' }, admin)).toMatchObject({
      ok: false,
      status: 409,
      errors: { username: 'is already taken' },
    });
  });

  it('changes roles and passwords, logging the role change and masking the password', () => {
    const { hotel } = emptyHotel();
    const jordan = addStaff(hotel, 'jordan');
    hotel.employees.update(jordan.id, { role: 'receiving', password: 'newpassword' }, admin);
    expect(hotel.employees.authenticate('jordan', 'newpassword')).toMatchObject({ role: 'receiving' });
    const [entry] = hotel.audit.list({ entityId: jordan.id });
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: 'role', from: 'staff', to: 'receiving' },
        { field: 'passwordHash', from: '•••', to: '•••' },
      ]),
    );
  });

  it('blocks archived employees from signing in and unassigns their open work', () => {
    const { hotel, pet, room } = emptyHotel();
    const jordan = addStaff(hotel, 'jordan');
    hotel.stays.book({ petId: pet.id, roomId: room.id, checkIn: TODAY, checkOut: '2026-11-22' }, admin);
    hotel.tasks.generate(TODAY, [jordan.id], admin);
    hotel.employees.remove(jordan.id, admin);
    expect(hotel.employees.authenticate('jordan', 'staff123')).toBeUndefined();
    expect(hotel.tasks.list({ date: TODAY }).every((t) => t.assigneeId === null)).toBe(true);
  });

  it('protects the last admin from being archived or demoted', () => {
    const { hotel } = emptyHotel();
    const boss = addStaff(hotel, 'boss', 'admin');
    expect(hotel.employees.remove(boss.id, admin)).toMatchObject({ ok: false, status: 409, error: 'At least one admin is required' });
    expect(hotel.employees.update(boss.id, { role: 'staff' }, admin)).toMatchObject({ ok: false, status: 409 });
    addStaff(hotel, 'boss2', 'admin');
    expect(hotel.employees.remove(boss.id, admin).ok).toBe(true);
  });
});

describe('owners and pets', () => {
  it('searches owners and pets by text, including owner name and breed', () => {
    const { hotel, owner } = emptyHotel();
    hotel.pets.create({ name: 'Mochi', species: 'cat', breed: 'Siamese', ownerId: owner.id, specialInstructions: '' }, admin);
    expect(hotel.owners.list({ text: 'whit' }).map((o) => o.name)).toEqual(['Dana Whitfield']);
    expect(hotel.pets.list({ text: 'siam' }).map((p) => p.name)).toEqual(['Mochi']);
    expect(hotel.pets.list({ text: 'dana' }).map((p) => p.name)).toEqual(['Biscuit', 'Mochi']);
    expect(hotel.pets.list({ ownerId: owner.id })).toHaveLength(2);
  });

  it('requires an existing, active owner for a pet', () => {
    const { hotel } = emptyHotel();
    expect(
      hotel.pets.create({ name: 'X', species: 'dog', breed: 'Mutt', ownerId: 'own-99', specialInstructions: '' }, admin),
    ).toMatchObject({ ok: false, status: 400, errors: { ownerId: 'does not match an owner' } });
  });

  it('will not archive an owner who still has pets on file', () => {
    const { hotel, owner, pet } = emptyHotel();
    expect(hotel.owners.remove(owner.id, admin)).toMatchObject({ ok: false, status: 409 });
    hotel.pets.remove(pet.id, admin);
    expect(hotel.owners.remove(owner.id, admin).ok).toBe(true);
    expect(hotel.owners.list({ includeDeleted: true })).toHaveLength(1);
  });

  it('will not archive a pet with an active stay', () => {
    const { hotel, pet, room } = emptyHotel();
    hotel.stays.book({ petId: pet.id, roomId: room.id, checkIn: TODAY, checkOut: '2026-11-22' }, admin);
    expect(hotel.pets.remove(pet.id, admin)).toMatchObject({ ok: false, status: 409, error: 'Pet has an active stay' });
  });
});

describe('stays', () => {
  it('books a room and lists arrivals and departures for a day', () => {
    const { hotel, pet, room } = emptyHotel();
    const stay = hotel.stays.book({ petId: pet.id, roomId: room.id, checkIn: TODAY, checkOut: '2026-11-22' }, admin).value!;
    expect(stay.status).toBe('booked');
    expect(hotel.stays.arrivals(TODAY).map((s) => s.id)).toEqual([stay.id]);
    expect(hotel.stays.departures('2026-11-22').map((s) => s.id)).toEqual([stay.id]);
    expect(hotel.stays.departures(TODAY)).toEqual([]);
  });

  it('rejects double-booking a room but allows same-day turnover', () => {
    const { hotel, pet, room, owner } = emptyHotel();
    const other = hotel.pets.create({ name: 'Mochi', species: 'cat', breed: 'Siamese', ownerId: owner.id, specialInstructions: '' }, admin).value!;
    hotel.stays.book({ petId: pet.id, roomId: room.id, checkIn: TODAY, checkOut: '2026-11-22' }, admin);
    expect(hotel.stays.book({ petId: other.id, roomId: room.id, checkIn: '2026-11-21', checkOut: '2026-11-23' }, admin)).toMatchObject({
      ok: false,
      status: 409,
      errors: { roomId: 'is already booked for those dates' },
    });
    expect(hotel.stays.book({ petId: other.id, roomId: room.id, checkIn: '2026-11-22', checkOut: '2026-11-24' }, admin).ok).toBe(true);
  });

  it('rejects overlapping stays for the same pet and bookings in the past', () => {
    const { hotel, pet, room } = emptyHotel();
    const room2 = hotel.rooms.create({ name: 'B-301', type: 'basic', nightlyRate: 45 }, admin).value!;
    hotel.stays.book({ petId: pet.id, roomId: room.id, checkIn: TODAY, checkOut: '2026-11-22' }, admin);
    expect(hotel.stays.book({ petId: pet.id, roomId: room2.id, checkIn: '2026-11-21', checkOut: '2026-11-23' }, admin)).toMatchObject({
      ok: false,
      status: 409,
      errors: { petId: 'already has a stay for those dates' },
    });
    expect(hotel.stays.book({ petId: pet.id, roomId: room2.id, checkIn: '2026-11-19', checkOut: '2026-11-20' }, admin)).toMatchObject({
      ok: false,
      status: 400,
      errors: { checkIn: 'cannot be in the past' },
    });
  });

  it('checks in, checks out and cancels with status rules', () => {
    const { hotel, pet, room, clock } = emptyHotel();
    const future = hotel.stays.book({ petId: pet.id, roomId: room.id, checkIn: '2026-11-25', checkOut: '2026-11-27' }, admin).value!;
    expect(hotel.stays.checkIn(future.id, admin)).toMatchObject({ ok: false, status: 409, error: 'Check-in opens on 2026-11-25' });
    expect(hotel.stays.checkOut(future.id, admin)).toMatchObject({ ok: false, status: 409 });
    expect(hotel.stays.cancel(future.id, admin).value!.status).toBe('cancelled');

    const stay = hotel.stays.book({ petId: pet.id, roomId: room.id, checkIn: TODAY, checkOut: '2026-11-22' }, admin).value!;
    expect(hotel.stays.checkIn(stay.id, admin).value!.status).toBe('checked_in');
    expect(hotel.stays.cancel(stay.id, admin)).toMatchObject({ ok: false, status: 409 });
    clock.set(new Date('2026-11-21T10:00:00'));
    expect(hotel.stays.checkOut(stay.id, admin).value!.status).toBe('checked_out');
  });

  it('drops pending future care rounds when a stay ends early', () => {
    const { hotel, pet, room, clock } = emptyHotel();
    const jordan = addStaff(hotel, 'jordan');
    const stay = hotel.stays.book({ petId: pet.id, roomId: room.id, checkIn: TODAY, checkOut: '2026-11-23' }, admin).value!;
    hotel.stays.checkIn(stay.id, admin);
    hotel.tasks.generate('2026-11-21', [jordan.id], admin);
    hotel.tasks.generate('2026-11-22', [jordan.id], admin);
    clock.set(new Date('2026-11-21T07:00:00'));
    hotel.stays.checkOut(stay.id, admin);
    expect(hotel.tasks.list({ date: '2026-11-22' })).toEqual([]);
    expect(hotel.tasks.list({ date: '2026-11-21' })).toHaveLength(2); // today's rounds stay on record
  });

  it('reports room occupancy for a date', () => {
    const { hotel, pet, room } = emptyHotel();
    hotel.rooms.create({ name: 'B-301', type: 'basic', nightlyRate: 45 }, admin);
    hotel.stays.book({ petId: pet.id, roomId: room.id, checkIn: TODAY, checkOut: '2026-11-22' }, admin);
    expect(hotel.rooms.occupancy(TODAY)).toEqual([
      expect.objectContaining({ name: 'E-101', occupied: true, petId: pet.id }),
      expect.objectContaining({ name: 'B-301', occupied: false, petId: null }),
    ]);
    expect(hotel.rooms.occupancy('2026-11-22')[0].occupied).toBe(false);
  });

  it('will not archive a room with an active stay', () => {
    const { hotel, pet, room } = emptyHotel();
    hotel.stays.book({ petId: pet.id, roomId: room.id, checkIn: TODAY, checkOut: '2026-11-22' }, admin);
    expect(hotel.rooms.remove(room.id, admin)).toMatchObject({ ok: false, status: 409 });
  });
});

describe('notes', () => {
  it('appends notes newest first and records who wrote them', () => {
    const { hotel, pet, clock } = emptyHotel();
    hotel.notes.add(pet.id, { text: 'Arrived calm.' }, admin);
    clock.set(new Date(`${TODAY}T12:00:00`));
    hotel.notes.add(pet.id, { text: 'Ate half of lunch.' }, { id: 'emp-3', name: 'Jordan Lee' });
    const notes = hotel.notes.list(pet.id);
    expect(notes.map((n) => n.text)).toEqual(['Ate half of lunch.', 'Arrived calm.']);
    expect(notes[0]).toMatchObject({ createdBy: { name: 'Jordan Lee' }, taskId: null });
  });

  it('rejects notes for unknown pets and empty text', () => {
    const { hotel, pet } = emptyHotel();
    expect(hotel.notes.add('pet-99', { text: 'x' }, admin)).toMatchObject({ ok: false, status: 404 });
    expect(hotel.notes.add(pet.id, { text: ' ' }, admin)).toMatchObject({ ok: false, status: 400 });
  });
});

describe('care tasks', () => {
  function withStaysAndStaff() {
    const ctx = emptyHotel();
    const { hotel, owner } = ctx;
    const staff = ['jordan', 'sam', 'alex'].map((u) => addStaff(hotel, u));
    for (let i = 0; i < 4; i++) {
      const pet = hotel.pets.create({ name: `Pet ${i}`, species: 'dog', breed: 'Mutt', ownerId: owner.id, specialInstructions: '' }, admin).value!;
      const room = hotel.rooms.create({ name: `B-30${i}`, type: 'basic', nightlyRate: 45 }, admin).value!;
      hotel.stays.book({ petId: pet.id, roomId: room.id, checkIn: TODAY, checkOut: '2026-11-25' }, admin);
    }
    return { ...ctx, staff };
  }

  it('generates the day’s rounds and spreads them evenly over the staff on shift', () => {
    const { hotel, staff } = withStaysAndStaff();
    const created = hotel.tasks.generate('2026-11-21', staff.map((s) => s.id), admin);
    expect(created.value).toHaveLength(8); // 4 pets × morning + evening
    const counts = staff.map((s) => hotel.tasks.list({ date: '2026-11-21', assigneeId: s.id }).length);
    expect(counts.sort()).toEqual([2, 3, 3]);
    expect(hotel.tasks.generate('2026-11-21', staff.map((s) => s.id), admin).value).toEqual([]);
  });

  it('defaults to every active staff member and refuses people who are not staff', () => {
    const { hotel, staff } = withStaysAndStaff();
    const desk = addStaff(hotel, 'desk', 'receiving');
    expect(hotel.tasks.generate('2026-11-21', [desk.id], admin)).toMatchObject({
      ok: false,
      status: 400,
      errors: { staffIds: `${desk.id} is not active general staff` },
    });
    hotel.tasks.generate('2026-11-21', undefined, admin);
    const assignees = new Set(hotel.tasks.list({ date: '2026-11-21' }).map((t) => t.assigneeId));
    expect(assignees).toEqual(new Set(staff.map((s) => s.id)));
  });

  it('rebalances pending work when someone goes off shift, keeping completed work in place', () => {
    const { hotel, staff } = withStaysAndStaff();
    hotel.tasks.generate('2026-11-21', staff.map((s) => s.id), admin);
    const [first] = hotel.tasks.list({ date: '2026-11-21', assigneeId: staff[0].id });
    hotel.tasks.update(first.id, { cleaned: true, fed: true }, staff[0]);
    hotel.tasks.attachPhoto(first.id, 'pho-1', staff[0]);
    hotel.tasks.complete(first.id, staff[0]);

    hotel.tasks.rebalance('2026-11-21', [staff[1].id, staff[2].id], admin);
    const tasks = hotel.tasks.list({ date: '2026-11-21' });
    expect(tasks.find((t) => t.id === first.id)!.assigneeId).toBe(staff[0].id);
    const pendingOwners = tasks.filter((t) => t.status === 'pending').map((t) => t.assigneeId);
    expect(pendingOwners).not.toContain(staff[0].id);
    expect(Math.abs(pendingOwners.filter((id) => id === staff[1].id).length - pendingOwners.filter((id) => id === staff[2].id).length)).toBeLessThanOrEqual(1);
  });

  it('reassigns a task to another staff member', () => {
    const { hotel, staff } = withStaysAndStaff();
    hotel.tasks.generate('2026-11-21', [staff[0].id], admin);
    const [task] = hotel.tasks.list({ date: '2026-11-21' });
    expect(hotel.tasks.reassign(task.id, staff[2].id, admin).value!.assigneeId).toBe(staff[2].id);
    expect(hotel.tasks.reassign(task.id, 'emp-404', admin)).toMatchObject({ ok: false, status: 400 });
  });

  it('only completes once cleaned, fed and photographed, then locks the task', () => {
    const { hotel, staff } = withStaysAndStaff();
    hotel.tasks.generate('2026-11-21', [staff[0].id], admin);
    const [task] = hotel.tasks.list({ date: '2026-11-21' });
    expect(hotel.tasks.complete(task.id, staff[0])).toMatchObject({
      ok: false,
      status: 400,
      errors: { cleaned: 'must be checked', fed: 'must be checked', photo: 'is required' },
    });
    hotel.tasks.update(task.id, { cleaned: true, fed: true }, staff[0]);
    hotel.tasks.attachPhoto(task.id, 'pho-1', staff[0]);
    const done = hotel.tasks.complete(task.id, staff[0]).value!;
    expect(done).toMatchObject({ status: 'completed', cleaned: true, fed: true, photoId: 'pho-1' });
    expect(done.completedAt).toBeTruthy();
    expect(hotel.tasks.update(task.id, { cleaned: false }, staff[0])).toMatchObject({ ok: false, status: 409 });
  });

  it('lists a staff member’s queue with pet, room and instructions, pending first', () => {
    const { hotel, staff } = withStaysAndStaff();
    hotel.tasks.generate('2026-11-21', [staff[0].id], admin);
    const queue = hotel.tasks.queue(staff[0].id, '2026-11-21');
    expect(queue).toHaveLength(8);
    expect(queue[0]).toMatchObject({ slot: 'morning', pet: { name: 'Pet 0' }, room: { name: 'B-300' } });
    expect(queue[0].pet).toHaveProperty('specialInstructions');
    expect(queue[0].owner).toMatchObject({ name: 'Dana Whitfield' });
  });
});

describe('seeded hotel', () => {
  it('seeds staff accounts, rooms of every type, guests and today’s schedule', () => {
    const clock = createClock(new Date(`${TODAY}T08:00:00`));
    const hotel = createHotel({ clock });
    expect(hotel.employees.authenticate('admin', 'password123')).toMatchObject({ role: 'admin' });
    expect(hotel.employees.authenticate('frontdesk', 'frontdesk123')).toMatchObject({ role: 'receiving' });
    expect(hotel.employees.authenticate('jordan', 'staff123')).toMatchObject({ role: 'staff' });
    expect(new Set(hotel.rooms.list().map((r) => r.type))).toEqual(new Set(['exclusive', 'midline', 'basic']));
    expect(hotel.stays.arrivals(TODAY).length).toBeGreaterThan(0);
    expect(hotel.stays.departures(TODAY).length).toBeGreaterThan(0);
    expect(hotel.tasks.list({ date: TODAY }).length).toBeGreaterThan(0);
    expect(hotel.tasks.list({ date: TODAY }).every((t) => t.assigneeId)).toBe(true);
  });

  it('reset restores the seed relative to the clock’s current date', () => {
    const clock = createClock(new Date(`${TODAY}T08:00:00`));
    const hotel = createHotel({ clock });
    hotel.pets.create({ name: 'Extra', species: 'dog', breed: 'Mutt', ownerId: 'own-1', specialInstructions: '' }, admin);
    clock.set(new Date('2026-12-01T08:00:00'));
    hotel.reset();
    expect(hotel.pets.list().some((p) => p.name === 'Extra')).toBe(false);
    expect(hotel.stays.arrivals('2026-12-01').length).toBeGreaterThan(0);
    expect(hotel.audit.list({ entityType: 'pet' })).toHaveLength(8); // the pre-reset pet left no trace
  });
});
