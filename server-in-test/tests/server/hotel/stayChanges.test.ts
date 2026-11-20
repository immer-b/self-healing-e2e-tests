import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';

// Seed (today = 2026-11-20): stay-1 Biscuit E-101 18→22 checked in; stay-2 Mochi M-201 18→22 checked in;
// stay-5 Pepper B-301 20→23 booked; stay-6 Rocky B-302 20→24 booked; stay-7 Hazel M-203 21→25 booked.
const desk = { id: 'emp-2', name: 'Priya Shah' };

function setup() {
  return createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) });
}

describe('changing a stay', () => {
  it('extends a checked-in stay', () => {
    const hotel = setup();
    const changed = hotel.stays.change('stay-1', { checkOut: '2026-11-24' }, desk);
    expect(changed.value).toMatchObject({ checkIn: '2026-11-18', checkOut: '2026-11-24', status: 'checked_in' });
    expect(hotel.audit.list({ entityId: 'stay-1' })[0]).toMatchObject({ action: 'change', changes: [{ field: 'checkOut', from: '2026-11-22', to: '2026-11-24' }] });
  });

  it('refuses dates that overlap another stay in the room, but not the stay itself', () => {
    const hotel = setup();
    hotel.stays.book({ petId: 'pet-8', roomId: 'room-1', checkIn: '2026-11-22', checkOut: '2026-11-25' }, desk);
    expect(hotel.stays.change('stay-1', { checkOut: '2026-11-23' }, desk)).toMatchObject({
      ok: false,
      status: 409,
      errors: { roomId: 'is already booked for those dates' },
    });
    expect(hotel.stays.change('stay-1', { checkOut: '2026-11-21' }, desk).ok).toBe(true);
  });

  it('does not move the check-in date of a pet already here', () => {
    const hotel = setup();
    expect(hotel.stays.change('stay-1', { checkIn: '2026-11-19' }, desk)).toMatchObject({
      ok: false,
      status: 409,
      error: 'The pet is already checked in; only the check-out date and room can change',
    });
  });

  it('moves a booked stay to new dates that are not in the past', () => {
    const hotel = setup();
    expect(hotel.stays.change('stay-7', { checkIn: '2026-11-22', checkOut: '2026-11-26' }, desk).value).toMatchObject({ checkIn: '2026-11-22' });
    expect(hotel.stays.change('stay-7', { checkIn: '2026-11-19' }, desk)).toMatchObject({ ok: false, errors: { checkIn: 'cannot be in the past' } });
    expect(hotel.stays.change('stay-7', { checkOut: '2026-11-21' }, desk)).toMatchObject({ ok: false, errors: { checkOut: 'must be after check-in' } });
  });

  it('moves a pet to another room, taking its open rounds along', () => {
    const hotel = setup();
    hotel.stays.change('stay-1', { roomId: 'room-12' }, desk);
    const pending = hotel.tasks.list({ date: '2026-11-20' }).filter((t) => t.stayId === 'stay-1');
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((t) => t.roomId === 'room-12')).toBe(true);
  });

  it('drops open rounds that fall outside a shortened stay', () => {
    const hotel = setup();
    hotel.tasks.generate('2026-11-21', undefined, desk);
    hotel.stays.change('stay-6', { checkOut: '2026-11-21' }, desk);
    const rocky = hotel.tasks.list({ date: '2026-11-21' }).filter((t) => t.stayId === 'stay-6');
    expect(rocky.map((t) => t.slot)).toEqual(['morning']); // departure day keeps only the morning round
  });

  it('cannot change a stay that has ended or was cancelled', () => {
    const hotel = setup();
    expect(hotel.stays.change('stay-8', { checkOut: '2026-11-30' }, desk)).toMatchObject({ ok: false, status: 409 });
    expect(hotel.stays.change('stay-404', { checkOut: '2026-11-30' }, desk)).toMatchObject({ ok: false, status: 404 });
  });

  it('can list rooms free for a stay, ignoring the stay being changed', () => {
    const hotel = setup();
    const names = hotel.rooms.available('2026-11-20', '2026-11-24', 'stay-1').value!.map((r) => r.name);
    expect(names).toContain('E-101');
  });
});

describe('PUT /api/hotel/stays/:id', () => {
  it('changes a stay for the front desk', async () => {
    const app = express().use(express.json()).use('/api/hotel', hotelRoutes(setup()));
    const agent = request.agent(app);
    await agent.post('/api/hotel/auth/login').send({ username: 'frontdesk', password: 'frontdesk123' });
    const res = await agent.put('/api/hotel/stays/stay-1').send({ checkOut: '2026-11-24' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ checkOut: '2026-11-24', room: { name: 'E-101' } });
    const free = await agent.get('/api/hotel/rooms/available?checkIn=2026-11-20&checkOut=2026-11-26&excludeStayId=stay-1');
    expect(free.body.map((r: { name: string }) => r.name)).toContain('E-101');
  });
});
