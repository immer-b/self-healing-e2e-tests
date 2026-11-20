import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';
import { DESK, givenHotel } from './builders';

describe('changing a stay', () => {
  it('extends a checked-in stay', () => {
    const h = givenHotel();
    const stay = h.stay({ startsIn: -2, nights: 4, status: 'checked_in' }); // 18 → 22
    const changed = h.hotel.stays.change(stay.id, { checkOut: '2026-11-24' }, DESK);
    expect(changed.value).toMatchObject({ checkIn: '2026-11-18', checkOut: '2026-11-24', status: 'checked_in' });
    expect(h.hotel.audit.list({ entityId: stay.id })[0]).toMatchObject({
      action: 'change',
      changes: [{ field: 'checkOut', from: '2026-11-22', to: '2026-11-24' }],
    });
  });

  it('refuses dates that overlap another stay in the room, but not the stay itself', () => {
    const h = givenHotel();
    const room = h.room();
    const stay = h.stay({ roomId: room.id, startsIn: -2, nights: 4, status: 'checked_in' }); // 18 → 22
    h.stay({ roomId: room.id, startsIn: 2, nights: 3 }); // 22 → 25
    expect(h.hotel.stays.change(stay.id, { checkOut: '2026-11-23' }, DESK)).toMatchObject({
      ok: false,
      status: 409,
      errors: { roomId: 'is already booked for those dates' },
    });
    expect(h.hotel.stays.change(stay.id, { checkOut: '2026-11-21' }, DESK).ok).toBe(true);
  });

  it('does not move the check-in date of a pet already here', () => {
    const h = givenHotel();
    const stay = h.stay({ startsIn: -2, status: 'checked_in' });
    expect(h.hotel.stays.change(stay.id, { checkIn: '2026-11-19' }, DESK)).toMatchObject({
      ok: false,
      status: 409,
      error: 'The pet is already checked in; only the check-out date and room can change',
    });
  });

  it('moves a booked stay to new dates that are not in the past', () => {
    const h = givenHotel();
    const stay = h.stay({ startsIn: 1, nights: 4 }); // 21 → 25
    expect(h.hotel.stays.change(stay.id, { checkIn: '2026-11-22', checkOut: '2026-11-26' }, DESK).value).toMatchObject({ checkIn: '2026-11-22' });
    expect(h.hotel.stays.change(stay.id, { checkIn: '2026-11-19' }, DESK)).toMatchObject({ ok: false, errors: { checkIn: 'cannot be in the past' } });
    expect(h.hotel.stays.change(stay.id, { checkOut: '2026-11-21' }, DESK)).toMatchObject({ ok: false, errors: { checkOut: 'must be after check-in' } });
  });

  it('moves a pet to another room, taking its open rounds along', () => {
    const h = givenHotel();
    h.staff();
    const stay = h.stay({ startsIn: -2, nights: 4, status: 'checked_in' });
    h.hotel.tasks.generate(h.today, undefined, DESK);
    const newRoom = h.room();
    h.hotel.stays.change(stay.id, { roomId: newRoom.id }, DESK);
    const pending = h.hotel.tasks.list({ date: h.today }).filter((t) => t.stayId === stay.id);
    expect(pending).toHaveLength(2);
    expect(pending.every((t) => t.roomId === newRoom.id)).toBe(true);
  });

  it('drops open rounds that fall outside a shortened stay', () => {
    const h = givenHotel();
    h.staff();
    const stay = h.stay({ nights: 4 }); // 20 → 24
    h.hotel.tasks.generate('2026-11-21', undefined, DESK);
    h.hotel.stays.change(stay.id, { checkOut: '2026-11-21' }, DESK);
    expect(h.hotel.tasks.list({ date: '2026-11-21' }).map((t) => t.slot)).toEqual(['morning']); // departure day keeps the morning round
  });

  it('cannot change a stay that has ended or was cancelled', () => {
    const h = givenHotel();
    const ended = h.stay({ startsIn: -2, status: 'checked_in' });
    h.hotel.stays.checkOut(ended.id, DESK);
    const cancelled = h.stay({ startsIn: 3 });
    h.hotel.stays.cancel(cancelled.id, DESK);
    expect(h.hotel.stays.change(ended.id, { checkOut: '2026-11-30' }, DESK)).toMatchObject({ ok: false, status: 409 });
    expect(h.hotel.stays.change(cancelled.id, { checkOut: '2026-11-30' }, DESK)).toMatchObject({ ok: false, status: 409 });
    expect(h.hotel.stays.change('stay-404', { checkOut: '2026-11-30' }, DESK)).toMatchObject({ ok: false, status: 404 });
  });

  it('can list rooms free for a stay, ignoring the stay being changed', () => {
    const h = givenHotel();
    const room = h.room({ name: 'E-101' });
    const stay = h.stay({ roomId: room.id, startsIn: -2, nights: 4, status: 'checked_in' });
    expect(h.hotel.rooms.available('2026-11-20', '2026-11-24').value!.map((r) => r.name)).not.toContain('E-101');
    expect(h.hotel.rooms.available('2026-11-20', '2026-11-24', stay.id).value!.map((r) => r.name)).toContain('E-101');
  });
});

describe('PUT /api/hotel/stays/:id (seed smoke test)', () => {
  it('changes a stay for the front desk', async () => {
    const app = express().use(express.json()).use('/api/hotel', hotelRoutes(createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) })));
    const agent = request.agent(app);
    await agent.post('/api/hotel/auth/login').send({ username: 'frontdesk', password: 'frontdesk123' });
    const res = await agent.put('/api/hotel/stays/stay-1').send({ checkOut: '2026-11-24' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ checkOut: '2026-11-24', room: { name: 'E-101' } });
    const free = await agent.get('/api/hotel/rooms/available?checkIn=2026-11-20&checkOut=2026-11-26&excludeStayId=stay-1');
    expect(free.body.map((r: { name: string }) => r.name)).toContain('E-101');
  });
});
