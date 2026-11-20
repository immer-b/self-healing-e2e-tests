import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel, type Hotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';

let server: Server | undefined;
afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

async function start(): Promise<{ hotel: Hotel; base: string }> {
  const hotel = createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) });
  const app = express().use(express.json()).use('/api/hotel', hotelRoutes(hotel));
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return { hotel, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/hotel` };
}

async function signIn(base: string, username: string, password: string) {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return res.headers.getSetCookie()[0].split(';')[0];
}

/** Reads server-sent events until `count` change events have arrived. */
async function readEvents(response: Response, count: number) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: unknown[] = [];
  let buffer = '';
  while (events.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = frame.split('\n').find((line) => line.startsWith('data: '));
      if (frame.includes('event: change') && data) events.push(JSON.parse(data.slice(6)));
    }
  }
  await reader.cancel();
  return events;
}

describe('GET /api/hotel/events', () => {
  it('needs a session', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/events`)).status).toBe(401);
  });

  it('streams a change event for every write, without the data itself', async () => {
    const { hotel, base } = await start();
    const cookie = await signIn(base, 'frontdesk', 'frontdesk123');
    const response = await fetch(`${base}/events`, { headers: { cookie } });
    expect(response.headers.get('content-type')).toMatch(/text\/event-stream/);
    const pending = readEvents(response, 2);
    await new Promise((r) => setTimeout(r, 50)); // let the subscription register
    hotel.stays.checkIn('stay-5', { id: 'emp-2', name: 'Priya Shah' });
    hotel.notes.add('pet-1', { text: 'secret detail' }, { id: 'emp-2', name: 'Priya Shah' });
    const events = await pending;
    expect(events).toEqual([
      { entityType: 'stay', entityId: 'stay-5', action: 'check_in' },
      { entityType: 'note', entityId: 'note-4', action: 'create' },
    ]);
    expect(JSON.stringify(events)).not.toContain('secret detail');
  });

  it('stops sending to a client that disconnects', async () => {
    const { hotel, base } = await start();
    const cookie = await signIn(base, 'jordan', 'staff123');
    const controller = new AbortController();
    const response = await fetch(`${base}/events`, { headers: { cookie }, signal: controller.signal });
    expect(response.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(hotel.audit.subscriberCount()).toBe(1);
    controller.abort();
    await new Promise((r) => setTimeout(r, 100));
    expect(hotel.audit.subscriberCount()).toBe(0);
  });
});
