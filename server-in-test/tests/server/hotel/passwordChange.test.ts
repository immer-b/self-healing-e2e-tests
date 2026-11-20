import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';

function setup() {
  const hotel = createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) });
  const app = express().use(express.json()).use('/api/hotel', hotelRoutes(hotel));
  return { hotel, app };
}

const admin = { id: 'emp-1', name: 'Morgan Reyes' };
const newHire = { name: 'Casey Nguyen', username: 'casey', email: '', phone: '', role: 'receiving' as const, type: 'front_desk' as const, password: 'temporary1' };

async function signIn(app: express.Express, username: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/hotel/auth/login').send({ username, password });
  return { agent, res };
}

describe('temporary passwords', () => {
  it('marks new accounts and admin password resets as needing a change; seeded accounts do not', () => {
    const { hotel } = setup();
    expect(hotel.employees.create(newHire, admin).value).toMatchObject({ mustChangePassword: true });
    expect(hotel.employees.get('emp-3')).toMatchObject({ mustChangePassword: false });
    hotel.employees.update('emp-3', { password: 'reset-by-admin' }, admin);
    expect(hotel.employees.get('emp-3')).toMatchObject({ mustChangePassword: true });
    hotel.employees.update('emp-4', { role: 'receiving' }, admin);
    expect(hotel.employees.get('emp-4')).toMatchObject({ mustChangePassword: false });
  });

  it('blocks everything except changing the password until it is changed', async () => {
    const { hotel, app } = setup();
    hotel.employees.create(newHire, admin);
    const { agent, res } = await signIn(app, 'casey', 'temporary1');
    expect(res.body.employee.mustChangePassword).toBe(true);
    expect((await agent.get('/api/hotel/auth/me')).status).toBe(200);
    const blocked = await agent.get('/api/hotel/pets');
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({ error: 'Choose a new password to continue', code: 'password_change_required' });

    const changed = await agent.post('/api/hotel/auth/password').send({ currentPassword: 'temporary1', newPassword: 'my-own-secret' });
    expect(changed.status).toBe(200);
    expect(changed.body.employee.mustChangePassword).toBe(false);
    expect((await agent.get('/api/hotel/pets')).status).toBe(200);
    expect(hotel.employees.authenticate('casey', 'my-own-secret')).toBeTruthy();
  });
});

describe('POST /api/hotel/auth/password', () => {
  it('requires the current password', async () => {
    const { app } = setup();
    const { agent } = await signIn(app, 'jordan', 'staff123');
    const res = await agent.post('/api/hotel/auth/password').send({ currentPassword: 'wrong', newPassword: 'another-one' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual({ currentPassword: 'is incorrect' });
  });

  it('rejects short passwords and reusing the current one', async () => {
    const { app } = setup();
    const { agent } = await signIn(app, 'jordan', 'staff123');
    expect((await agent.post('/api/hotel/auth/password').send({ currentPassword: 'staff123', newPassword: 'short' })).body.errors).toEqual({
      newPassword: 'must be at least 8 characters',
    });
    expect((await agent.post('/api/hotel/auth/password').send({ currentPassword: 'staff123', newPassword: 'staff123' })).body.errors).toEqual({
      newPassword: 'must be different from the current password',
    });
  });

  it('records the change in the log as done by the employee themselves, masked', async () => {
    const { hotel, app } = setup();
    const { agent } = await signIn(app, 'jordan', 'staff123');
    await agent.post('/api/hotel/auth/password').send({ currentPassword: 'staff123', newPassword: 'brand-new-pw' });
    const [entry] = hotel.audit.list({ entityId: 'emp-3' });
    expect(entry).toMatchObject({ actor: { id: 'emp-3', name: 'Jordan Lee' }, action: 'password_change' });
    expect(entry.changes).toEqual([{ field: 'passwordHash', from: '•••', to: '•••' }]);
  });
});
