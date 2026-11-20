import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel, type Hotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';

const TODAY = '2026-11-20';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

let hotel: Hotel;
let app: express.Express;

beforeEach(() => {
  hotel = createHotel({ clock: createClock(new Date(`${TODAY}T08:00:00`)) });
  app = express().use(express.json()).use('/api/hotel', hotelRoutes(hotel));
});

const ACCOUNTS = {
  admin: ['admin', 'password123'],
  receiving: ['frontdesk', 'frontdesk123'],
  staff: ['jordan', 'staff123'],
} as const;

async function signedIn(role: keyof typeof ACCOUNTS) {
  const agent = request.agent(app);
  const [username, password] = ACCOUNTS[role];
  const res = await agent.post('/api/hotel/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

const newOwner = {
  name: 'Nadia Okafor',
  email: 'nadia@example.com',
  address: { line1: '5 Pine St', line2: '', city: 'Portland', state: 'OR', postalCode: '97201' },
  contacts: [{ name: 'Nadia Okafor', relationship: 'Owner', phones: [{ label: 'Mobile', number: '503-555-0188' }] }],
};

describe('authentication', () => {
  it('signs in with a session cookie that is HttpOnly and SameSite=Strict', async () => {
    const res = await request(app).post('/api/hotel/auth/login').send({ username: 'frontdesk', password: 'frontdesk123' });
    expect(res.status).toBe(200);
    expect(res.body.employee).toMatchObject({ name: 'Priya Shah', role: 'receiving' });
    expect(res.body.employee).not.toHaveProperty('passwordHash');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/hotel_session=[a-f0-9]{64}/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('rejects bad credentials with a generic message', async () => {
    const res = await request(app).post('/api/hotel/auth/login').send({ username: 'frontdesk', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid username or password' });
  });

  it('reports the current user and signs out', async () => {
    const agent = await signedIn('staff');
    expect((await agent.get('/api/hotel/auth/me')).body.employee).toMatchObject({ username: 'jordan' });
    expect((await agent.post('/api/hotel/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/hotel/auth/me')).status).toBe(401);
  });

  it('requires a session for every other endpoint', async () => {
    for (const path of ['/api/hotel/pets', '/api/hotel/rooms', '/api/hotel/tasks/mine', '/api/hotel/audit']) {
      expect((await request(app).get(path)).status, path).toBe(401);
    }
  });

  it('ends the session of an archived employee immediately', async () => {
    const staff = await signedIn('staff');
    const admin = await signedIn('admin');
    await admin.delete('/api/hotel/employees/emp-3');
    expect((await staff.get('/api/hotel/tasks/mine')).status).toBe(401);
  });
});

describe('role permissions', () => {
  it.each([
    ['staff', 'get', '/api/hotel/employees', 403],
    ['receiving', 'get', '/api/hotel/employees', 403],
    ['admin', 'get', '/api/hotel/employees', 200],
    ['staff', 'get', '/api/hotel/audit', 403],
    ['receiving', 'get', '/api/hotel/audit', 403],
    ['staff', 'get', '/api/hotel/pets', 403],
    ['receiving', 'get', '/api/hotel/pets', 200],
    ['admin', 'get', '/api/hotel/pets', 200],
    ['staff', 'get', '/api/hotel/tasks?date=2026-11-20', 403],
    ['receiving', 'get', '/api/hotel/tasks?date=2026-11-20', 200],
    ['staff', 'get', '/api/hotel/tasks/mine', 200],
    ['staff', 'get', '/api/hotel/rooms', 200],
    ['receiving', 'post', '/api/hotel/rooms', 403],
  ] as const)('%s %s %s -> %i', async (role, method, path, status) => {
    const agent = await signedIn(role);
    expect((await agent[method](path).send({})).status).toBe(status);
  });
});

describe('admin: employees and change logs', () => {
  it('creates an employee with a role, who can then sign in', async () => {
    const admin = await signedIn('admin');
    const res = await admin.post('/api/hotel/employees').send({
      name: 'Casey Nguyen', username: 'casey', email: 'casey@pawsinn.test', phone: '', role: 'staff', type: 'maintenance', password: 'welcome123',
    });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('passwordHash');
    expect((await request(app).post('/api/hotel/auth/login').send({ username: 'casey', password: 'welcome123' })).status).toBe(200);
  });

  it('returns field errors for invalid employees', async () => {
    const admin = await signedIn('admin');
    const res = await admin.post('/api/hotel/employees').send({ name: '', username: 'jordan', role: 'chef' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toMatchObject({ name: 'is required', role: expect.any(String), password: expect.any(String) });
  });

  it('changes a role and lists archived employees on request', async () => {
    const admin = await signedIn('admin');
    expect((await admin.put('/api/hotel/employees/emp-3').send({ role: 'receiving' })).body.role).toBe('receiving');
    const active = (await admin.get('/api/hotel/employees')).body.map((e: { username: string }) => e.username);
    expect(active).not.toContain('riley');
    const all = (await admin.get('/api/hotel/employees?includeDeleted=true')).body.map((e: { username: string }) => e.username);
    expect(all).toContain('riley');
  });

  it('archives and restores instead of deleting', async () => {
    const admin = await signedIn('admin');
    const archived = await admin.delete('/api/hotel/employees/emp-4');
    expect(archived.status).toBe(200);
    expect(archived.body.deletedAt).toBeTruthy();
    expect((await admin.post('/api/hotel/employees/emp-4/restore')).body.deletedAt).toBeNull();
  });

  it('refuses to let an admin archive themselves', async () => {
    const admin = await signedIn('admin');
    const res = await admin.delete('/api/hotel/employees/emp-1');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('You cannot archive your own account');
  });

  it('shows who changed an entity and when', async () => {
    const admin = await signedIn('admin');
    const desk = await signedIn('receiving');
    await desk.put('/api/hotel/pets/pet-1').send({ breed: 'Beagle mix' });
    const res = await admin.get('/api/hotel/audit?entityType=pet&entityId=pet-1');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      action: 'update',
      actor: { id: 'emp-2', name: 'Priya Shah' },
      changes: [{ field: 'breed', from: 'Beagle', to: 'Beagle mix' }],
    });
    expect(res.body[0].at).toBe(new Date(`${TODAY}T08:00:00`).toISOString());
    expect(res.body.at(-1).action).toBe('create');
  });
});

describe('front desk: owners, pets, rooms and stays', () => {
  it('creates an owner with several contacts and a pet for them', async () => {
    const desk = await signedIn('receiving');
    const owner = await desk.post('/api/hotel/owners').send({
      ...newOwner,
      contacts: [...newOwner.contacts, { name: 'Tomi Okafor', relationship: 'Brother', phones: [{ label: 'Mobile', number: '503-555-0189' }, { label: 'Work', number: '503-555-0190' }] }],
    });
    expect(owner.status).toBe(201);
    const pet = await desk.post('/api/hotel/pets').send({ name: 'Ziggy', species: 'cat', breed: 'Tabby', ownerId: owner.body.id, specialInstructions: '' });
    expect(pet.status).toBe(201);
    const list = await desk.get(`/api/hotel/pets?ownerId=${owner.body.id}`);
    expect(list.body).toEqual([expect.objectContaining({ name: 'Ziggy', owner: expect.objectContaining({ name: 'Nadia Okafor' }) })]);
  });

  it('searches pets and hides archived ones unless asked', async () => {
    const desk = await signedIn('receiving');
    expect((await desk.get('/api/hotel/pets?text=retriever')).body.map((p: { name: string }) => p.name)).toEqual(['Luna', 'Max']);
    await desk.delete('/api/hotel/pets/pet-8');
    expect((await desk.get('/api/hotel/pets?text=retriever')).body.map((p: { name: string }) => p.name)).toEqual(['Luna']);
    expect((await desk.get('/api/hotel/pets?text=retriever&includeDeleted=true')).body).toHaveLength(2);
  });

  it('lists today’s arrivals and departures with pet, owner and room details', async () => {
    const desk = await signedIn('receiving');
    const arrivals = await desk.get(`/api/hotel/stays/arrivals?date=${TODAY}`);
    expect(arrivals.body.map((s: { pet: { name: string } }) => s.pet.name)).toEqual(['Pepper', 'Rocky']);
    expect(arrivals.body[0]).toMatchObject({ status: 'booked', room: { name: 'B-301' }, owner: { name: 'Kenji Watanabe' } });
    const departures = await desk.get(`/api/hotel/stays/departures?date=${TODAY}`);
    expect(departures.body.map((s: { pet: { name: string } }) => s.pet.name)).toEqual(['Duke', 'Luna']);
  });

  it('defaults arrivals to the server’s today', async () => {
    const desk = await signedIn('receiving');
    expect((await desk.get('/api/hotel/stays/arrivals')).body).toHaveLength(2);
  });

  it('books a room, checks the pet in and out', async () => {
    const desk = await signedIn('receiving');
    const booked = await desk.post('/api/hotel/stays').send({ petId: 'pet-8', roomId: 'room-12', checkIn: TODAY, checkOut: '2026-11-21' });
    expect(booked.status).toBe(201);
    expect((await desk.post(`/api/hotel/stays/${booked.body.id}/check-in`)).body.status).toBe('checked_in');
    expect((await desk.post(`/api/hotel/stays/${booked.body.id}/check-out`)).body.status).toBe('checked_out');
  });

  it('reports booking conflicts', async () => {
    const desk = await signedIn('receiving');
    const res = await desk.post('/api/hotel/stays').send({ petId: 'pet-8', roomId: 'room-1', checkIn: TODAY, checkOut: '2026-11-21' });
    expect(res.status).toBe(409);
    expect(res.body.errors).toEqual({ roomId: 'is already booked for those dates' });
  });

  it('shows room occupancy and a dashboard summary', async () => {
    const desk = await signedIn('receiving');
    const rooms = await desk.get(`/api/hotel/rooms/occupancy?date=${TODAY}`);
    expect(rooms.body.find((r: { name: string }) => r.name === 'E-101')).toMatchObject({ occupied: true, pet: { name: 'Biscuit' } });
    const summary = await desk.get(`/api/hotel/dashboard?date=${TODAY}`);
    expect(summary.body).toMatchObject({ date: TODAY, arrivals: 2, departures: 2, inHouse: 4, rooms: 12, tasks: { total: 8, completed: 0 } });
  });

  it('archives an owner only after their pets', async () => {
    const desk = await signedIn('receiving');
    const owner = (await desk.post('/api/hotel/owners').send(newOwner)).body;
    const pet = (await desk.post('/api/hotel/pets').send({ name: 'Ziggy', species: 'cat', breed: 'Tabby', ownerId: owner.id, specialInstructions: '' })).body;
    expect((await desk.delete(`/api/hotel/owners/${owner.id}`)).status).toBe(409);
    await desk.delete(`/api/hotel/pets/${pet.id}`);
    expect((await desk.delete(`/api/hotel/owners/${owner.id}`)).status).toBe(200);
    expect((await desk.get(`/api/hotel/owners/${owner.id}`)).body.deletedAt).toBeTruthy();
  });

  it('returns 404 for unknown ids', async () => {
    const desk = await signedIn('receiving');
    expect((await desk.get('/api/hotel/pets/pet-404')).status).toBe(404);
    expect((await desk.put('/api/hotel/owners/own-404').send({ name: 'x' })).status).toBe(404);
    expect((await desk.post('/api/hotel/stays/stay-404/check-in')).status).toBe(404);
  });
});

describe('front desk: care schedule', () => {
  it('shows the day’s board and the staff who can be scheduled', async () => {
    const desk = await signedIn('receiving');
    const board = await desk.get(`/api/hotel/tasks?date=${TODAY}`);
    expect(board.body).toHaveLength(8);
    expect(board.body[0]).toMatchObject({ pet: expect.any(Object), room: expect.any(Object), assignee: expect.any(Object) });
    const staff = await desk.get('/api/hotel/employees/staff');
    expect(staff.body.map((e: { name: string }) => e.name)).toEqual(['Jordan Lee', 'Sam Rivera', 'Alex Chen']);
  });

  it('generates tomorrow’s schedule for the chosen staff and rebalances it', async () => {
    const desk = await signedIn('receiving');
    const generated = await desk.post('/api/hotel/tasks/generate').send({ date: '2026-11-21', staffIds: ['emp-3', 'emp-4'] });
    expect(generated.status).toBe(201);
    const counts = (ids: string[]) => ['emp-3', 'emp-4', 'emp-5'].map((id) => ids.filter((x) => x === id).length);
    expect(counts(generated.body.map((t: { assigneeId: string }) => t.assigneeId))).toEqual([5, 4, 0]); // 9 rounds: 4 pets × 2 plus Hazel's arrival evening
    const rebalanced = await desk.post('/api/hotel/tasks/rebalance').send({ date: '2026-11-21' });
    expect(counts(rebalanced.body.map((t: { assigneeId: string }) => t.assigneeId)).sort()).toEqual([3, 3, 3]);
  });

  it('reassigns a single task', async () => {
    const desk = await signedIn('receiving');
    const [task] = (await desk.get(`/api/hotel/tasks?date=${TODAY}`)).body;
    const other = ['emp-3', 'emp-4', 'emp-5'].find((id) => id !== task.assigneeId);
    const res = await desk.put(`/api/hotel/tasks/${task.id}/assignee`).send({ assigneeId: other });
    expect(res.status).toBe(200);
    expect(res.body.assigneeId).toBe(other);
  });
});

describe('general staff: care queue', () => {
  const firstTask = async (agent: request.Agent) => (await agent.get('/api/hotel/tasks/mine')).body[0];

  it('lists only my rounds for today with instructions', async () => {
    const staff = await signedIn('staff');
    const queue = (await staff.get('/api/hotel/tasks/mine')).body;
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((t: { assigneeId: string; date: string }) => t.assigneeId === 'emp-3' && t.date === TODAY)).toBe(true);
    expect(queue[0].pet).toHaveProperty('specialInstructions');
  });

  it('checks off cleaning and feeding, uploads a photo, adds a note and completes', async () => {
    const staff = await signedIn('staff');
    const task = await firstTask(staff);
    expect((await staff.put(`/api/hotel/tasks/${task.id}`).send({ cleaned: true, fed: true })).body).toMatchObject({ cleaned: true, fed: true });

    const upload = await staff.post(`/api/hotel/tasks/${task.id}/photo`).set('Content-Type', 'image/png').send(PNG);
    expect(upload.status).toBe(200);
    expect(upload.body.photoId).toMatch(/^pho-/);
    const photo = await staff.get(`/api/hotel/photos/${upload.body.photoId}`);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(photo.body, PNG)).toBe(0);

    const note = await staff.post(`/api/hotel/pets/${task.petId}/notes`).send({ text: 'Water bowl was tipped over; refilled.', taskId: task.id });
    expect(note.status).toBe(201);
    expect(note.body).toMatchObject({ createdBy: { name: 'Jordan Lee' }, taskId: task.id });

    const done = await staff.post(`/api/hotel/tasks/${task.id}/complete`);
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('completed');
    expect((await firstTask(staff)).id).not.toBe(task.id); // completed work drops to the end of the queue
  });

  it('refuses to complete before the checklist and photo are done', async () => {
    const staff = await signedIn('staff');
    const task = await firstTask(staff);
    const res = await staff.post(`/api/hotel/tasks/${task.id}/complete`);
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual({ cleaned: 'must be checked', fed: 'must be checked', photo: 'is required' });
  });

  it('rejects uploads that are not images', async () => {
    const staff = await signedIn('staff');
    const task = await firstTask(staff);
    const res = await staff.post(`/api/hotel/tasks/${task.id}/photo`).set('Content-Type', 'text/plain').send('hello');
    expect(res.status).toBe(415);
  });

  it('cannot touch another carer’s task', async () => {
    const desk = await signedIn('receiving');
    const staff = await signedIn('staff');
    const board = (await desk.get(`/api/hotel/tasks?date=${TODAY}`)).body;
    const notMine = board.find((t: { assigneeId: string }) => t.assigneeId !== 'emp-3');
    expect((await staff.put(`/api/hotel/tasks/${notMine.id}`).send({ cleaned: true })).status).toBe(403);
    expect((await staff.post(`/api/hotel/tasks/${notMine.id}/complete`)).status).toBe(403);
    expect((await staff.get(`/api/hotel/tasks/${notMine.id}`)).status).toBe(403);
  });

  it('reads a pet’s legal notes newest first', async () => {
    const staff = await signedIn('staff');
    await staff.post('/api/hotel/pets/pet-1/notes').send({ text: 'Newest note' });
    const notes = (await staff.get('/api/hotel/pets/pet-1/notes')).body;
    expect(notes[0]).toMatchObject({ text: 'Newest note', createdBy: { name: 'Jordan Lee' } });
    expect(notes).toHaveLength(2);
  });

  it('offers no way to edit or delete a note', async () => {
    const staff = await signedIn('admin');
    const [note] = (await staff.get('/api/hotel/pets/pet-1/notes')).body;
    expect((await staff.put(`/api/hotel/pets/pet-1/notes/${note.id}`).send({ text: 'x' })).status).toBe(404);
    expect((await staff.delete(`/api/hotel/pets/pet-1/notes/${note.id}`)).status).toBe(404);
  });
});
