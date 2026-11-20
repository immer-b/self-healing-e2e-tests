import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';

/**
 * Contract snapshot: the *shape* of each response (keys and value types, not values). The UI's
 * types in src/apps/hotel/api.ts are written by hand against these, so a change here must be a
 * conscious one: update the snapshot (vitest -u) and the UI types together.
 */
type Shape = string | Shape[] | { [key: string]: Shape };

function shape(value: unknown): Shape {
  if (value === null) return 'null';
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, shape((value as Record<string, unknown>)[k])]),
    );
  }
  return typeof value;
}

const ENDPOINTS: [role: 'admin' | 'staff', path: string][] = [
  ['admin', '/auth/me'],
  ['admin', '/employees'],
  ['admin', '/audit?limit=1&entityType=pet'],
  ['admin', '/rooms'],
  ['admin', '/rooms/occupancy?date=2026-11-20'],
  ['admin', '/owners'],
  ['admin', '/pets?ownerId=own-1'],
  ['admin', '/pets/pet-1'],
  ['admin', '/pets/pet-1/notes'],
  ['admin', '/pets/pet-1/stays'],
  ['admin', '/stays/arrivals?date=2026-11-20'],
  ['admin', '/dashboard?date=2026-11-20'],
  ['admin', '/tasks?date=2026-11-20'],
  ['staff', '/tasks/mine'],
];

describe('API contract', async () => {
  const hotel = createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) });
  const app = express().use(express.json()).use('/api/hotel', hotelRoutes(hotel));
  const admin = request.agent(app);
  const staff = request.agent(app);
  await admin.post('/api/hotel/auth/login').send({ username: 'admin', password: 'password123' });
  await staff.post('/api/hotel/auth/login').send({ username: 'jordan', password: 'staff123' });

  it.each(ENDPOINTS)('%s GET %s keeps its shape', async (role, path) => {
    const res = await (role === 'admin' ? admin : staff).get(`/api/hotel${path}`);
    expect(res.status).toBe(200);
    expect(shape(res.body)).toMatchSnapshot();
  });
});
