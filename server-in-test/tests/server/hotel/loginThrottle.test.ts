import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createClock } from '../../../src/server/hotel/clock';
import { createLoginThrottle } from '../../../src/server/hotel/loginThrottle';
import { createHotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';

const MIN = 60_000;

describe('login throttle', () => {
  const setup = () => {
    const clock = createClock(new Date('2026-11-20T08:00:00'));
    return { clock, throttle: createLoginThrottle(clock) };
  };

  it('locks a key after 5 failures within 15 minutes, for 15 minutes', () => {
    const { clock, throttle } = setup();
    for (let i = 0; i < 4; i++) throttle.fail('jordan|1.2.3.4');
    expect(throttle.check('jordan|1.2.3.4')).toEqual({ allowed: true });
    throttle.fail('jordan|1.2.3.4');
    expect(throttle.check('jordan|1.2.3.4')).toEqual({ allowed: false, retryAfterSeconds: 900 });
    clock.set(new Date(clock.now().getTime() + 14 * MIN));
    expect(throttle.check('jordan|1.2.3.4').allowed).toBe(false);
    clock.set(new Date(clock.now().getTime() + 1 * MIN));
    expect(throttle.check('jordan|1.2.3.4')).toEqual({ allowed: true });
  });

  it('forgets failures older than the window', () => {
    const { clock, throttle } = setup();
    for (let i = 0; i < 4; i++) throttle.fail('k');
    clock.set(new Date(clock.now().getTime() + 16 * MIN));
    throttle.fail('k');
    expect(throttle.check('k').allowed).toBe(true);
  });

  it('clears a key on success and keeps keys independent', () => {
    const { throttle } = setup();
    for (let i = 0; i < 4; i++) throttle.fail('a');
    throttle.succeed('a');
    throttle.fail('a');
    expect(throttle.check('a').allowed).toBe(true);
    for (let i = 0; i < 5; i++) throttle.fail('b');
    expect(throttle.check('a').allowed).toBe(true);
    expect(throttle.check('b').allowed).toBe(false);
  });
});

describe('POST /api/hotel/auth/login throttling', () => {
  it('answers 429 with Retry-After once locked, even with the right password', async () => {
    const hotel = createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) });
    const app = express().use(express.json()).use('/api/hotel', hotelRoutes(hotel));
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post('/api/hotel/auth/login').send({ username: 'jordan', password: 'nope' })).status).toBe(401);
    }
    const locked = await request(app).post('/api/hotel/auth/login').send({ username: 'jordan', password: 'staff123' });
    expect(locked.status).toBe(429);
    expect(locked.headers['retry-after']).toBe('900');
    expect(locked.body.error).toBe('Too many failed sign-in attempts. Try again in 15 minutes.');
    // other accounts are unaffected
    expect((await request(app).post('/api/hotel/auth/login').send({ username: 'sam', password: 'staff123' })).status).toBe(200);
    // a data reset clears lockouts
    hotel.reset();
    expect((await request(app).post('/api/hotel/auth/login').send({ username: 'jordan', password: 'staff123' })).status).toBe(200);
  });
});
