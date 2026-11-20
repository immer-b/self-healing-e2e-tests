import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';

const hotel = () => createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) });
const names = (list: { name: string }[]) => list.map((o) => o.name);

describe('possible duplicate owners', () => {
  it('matches the same name ignoring case and spacing', () => {
    expect(names(hotel().owners.duplicates({ name: '  dana   WHITFIELD ' }))).toEqual(['Dana Whitfield']);
  });

  it('matches the same email ignoring case', () => {
    expect(names(hotel().owners.duplicates({ email: 'Marcus.Bell@Example.com' }))).toEqual(['Marcus Bell']);
  });

  it('matches any contact phone number by its digits', () => {
    expect(names(hotel().owners.duplicates({ phones: ['503.555.0199'] }))).toEqual(['Dana Whitfield']);
  });

  it('ignores blanks, archived owners and the owner being edited', () => {
    const h = hotel();
    expect(h.owners.duplicates({ name: '', email: '', phones: [''] })).toEqual([]);
    expect(h.owners.duplicates({ name: 'Dana Whitfield', excludeId: 'own-1' })).toEqual([]);
  });
});

describe('GET /api/hotel/owners/duplicates', () => {
  it('returns matches for the front desk', async () => {
    const app = express().use(express.json()).use('/api/hotel', hotelRoutes(hotel()));
    const agent = request.agent(app);
    await agent.post('/api/hotel/auth/login').send({ username: 'frontdesk', password: 'frontdesk123' });
    const res = await agent.get('/api/hotel/owners/duplicates?name=Sofia%20Alvarez&phone=5035550170');
    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(['Sofia Alvarez']);
  });
});
