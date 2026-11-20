import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';
import { createSessionStore, readCookie, SESSION_TTL_MS } from '../../../src/server/hotel/sessions';

const START = new Date('2026-11-20T08:00:00');
const later = (ms: number) => new Date(START.getTime() + ms);

describe('session store', () => {
  it('resolves a session until it expires after 12 hours', () => {
    const clock = createClock(START);
    const sessions = createSessionStore(clock);
    const token = sessions.create('emp-3');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    clock.set(later(SESSION_TTL_MS - 1000));
    expect(sessions.resolve(token)).toBe('emp-3');
    clock.set(later(SESSION_TTL_MS));
    expect(sessions.resolve(token)).toBeUndefined();
  });

  it('issues unique tokens and revokes them', () => {
    const sessions = createSessionStore(createClock(START));
    const a = sessions.create('emp-3');
    const b = sessions.create('emp-3');
    expect(a).not.toBe(b);
    sessions.revoke(a);
    expect(sessions.resolve(a)).toBeUndefined();
    expect(sessions.resolve(b)).toBe('emp-3');
    expect(sessions.resolve(undefined)).toBeUndefined();
    expect(sessions.resolve('not-a-token')).toBeUndefined();
  });

  it('reads cookies by name', () => {
    expect(readCookie('a=1; hotel_session=abc; b=2', 'hotel_session')).toBe('abc');
    expect(readCookie(undefined, 'hotel_session')).toBeUndefined();
    expect(readCookie('hotel_session_x=1', 'hotel_session')).toBeUndefined();
  });
});

describe('sessions over HTTP', () => {
  const setup = async () => {
    const clock = createClock(START);
    const hotel = createHotel({ clock });
    const app = express().use(express.json()).use('/api/hotel', hotelRoutes(hotel));
    const res = await request(app).post('/api/hotel/auth/login').send({ username: 'frontdesk', password: 'frontdesk123' });
    const cookie = String(res.headers['set-cookie']).split(';')[0];
    return { clock, hotel, app, cookie, setCookie: String(res.headers['set-cookie']) };
  };

  it('sets a cookie that lasts as long as the session', async () => {
    const { setCookie } = await setup();
    expect(setCookie).toMatch(/Max-Age=43200/);
    expect(setCookie).toMatch(/Path=\//);
  });

  it('rejects the cookie once the session has expired', async () => {
    const { app, clock, cookie } = await setup();
    expect((await request(app).get('/api/hotel/auth/me').set('Cookie', cookie)).status).toBe(200);
    clock.set(later(SESSION_TTL_MS + 1000));
    expect((await request(app).get('/api/hotel/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('revokes the token on the server at sign-out, not just in the browser', async () => {
    const { app, cookie } = await setup();
    await request(app).post('/api/hotel/auth/logout').set('Cookie', cookie);
    expect((await request(app).get('/api/hotel/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('revokes every session on a data reset', async () => {
    const { app, hotel, cookie } = await setup();
    hotel.reset();
    expect((await request(app).get('/api/hotel/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('applies a role change on the next request', async () => {
    const { app, hotel, cookie } = await setup();
    hotel.employees.update('emp-2', { role: 'staff' }, { id: 'emp-1', name: 'Morgan Reyes' });
    expect((await request(app).get('/api/hotel/pets').set('Cookie', cookie)).status).toBe(403);
  });
});
