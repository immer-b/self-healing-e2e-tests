// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createOutbox, isQueueable } from '../../../src/apps/hotel/outbox';

const PUBLIC = resolve(__dirname, '../../../src/apps/public/hotel');

describe('service worker routing', () => {
  // sw-routes.js is a classic script for importScripts(); load it with a fake `self`.
  const self: { hotelStrategyFor?: (url: string, method: string, mode?: string) => string } = {};
  new Function('self', readFileSync(resolve(PUBLIC, 'sw-routes.js'), 'utf8'))(self);
  const strategy = (path: string, method = 'GET', mode?: string) => self.hotelStrategyFor!(`https://hotel.test${path}`, method, mode);

  it('serves page navigations network-first with the cached shell as fallback', () => {
    expect(strategy('/hotel/queue/task-1', 'GET', 'navigate')).toBe('shell');
  });

  it('serves hashed build assets from the cache first', () => {
    expect(strategy('/assets/hotel-abc123.js')).toBe('cache-first');
  });

  it('keeps a fallback copy of what carers read on their rounds', () => {
    for (const path of ['/api/hotel/tasks/mine', '/api/hotel/tasks/task-3', '/api/hotel/pets/pet-1/notes', '/api/hotel/auth/me']) {
      expect(strategy(path), path).toBe('network-first');
    }
  });

  it('never caches writes, photos, live updates or other API data', () => {
    expect(strategy('/api/hotel/tasks/task-3', 'PUT')).toBe('network-only');
    expect(strategy('/api/hotel/events')).toBe('network-only');
    expect(strategy('/api/hotel/photos/pho-1')).toBe('network-only');
    expect(strategy('/api/hotel/audit')).toBe('network-only');
    expect(strategy('/login/', 'GET', 'navigate')).toBe('network-only'); // outside the app's scope
  });

  it('ships a manifest that makes the app installable', () => {
    const manifest = JSON.parse(readFileSync(resolve(PUBLIC, 'manifest.webmanifest'), 'utf8'));
    expect(manifest).toMatchObject({ name: 'Willow Pet Hotel', start_url: '/hotel/', scope: '/hotel/', display: 'standalone' });
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});

describe('offline outbox', () => {
  let online = true;
  beforeEach(() => {
    online = true;
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  const setup = () => {
    const send = vi.fn(async (_write: { path: string }) => {
      if (!online) throw new TypeError('Failed to fetch');
    });
    return { send, outbox: createOutbox({ send, isOnline: () => online }) };
  };

  it('only queues checklist ticks and notes', () => {
    expect(isQueueable('PUT', '/api/hotel/tasks/task-1')).toBe(true);
    expect(isQueueable('POST', '/api/hotel/pets/pet-1/notes')).toBe(true);
    expect(isQueueable('POST', '/api/hotel/tasks/task-1/complete')).toBe(false);
    expect(isQueueable('POST', '/api/hotel/tasks/task-1/photo')).toBe(false);
    expect(isQueueable('DELETE', '/api/hotel/pets/pet-1')).toBe(false);
  });

  it('sends straight away when online', async () => {
    const { send, outbox } = setup();
    expect(await outbox.submit({ method: 'PUT', path: '/api/hotel/tasks/task-1', body: { fed: true } })).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    expect(outbox.pending()).toEqual([]);
  });

  it('keeps writes made offline, survives a reload, and sends them in order when back online', async () => {
    const { send, outbox } = setup();
    online = false;
    expect(await outbox.submit({ method: 'PUT', path: '/api/hotel/tasks/task-1', body: { cleaned: true } })).toBe('queued');
    expect(await outbox.submit({ method: 'POST', path: '/api/hotel/pets/pet-1/notes', body: { text: 'Ate well' } })).toBe('queued');
    expect(send).not.toHaveBeenCalled();

    const reloaded = createOutbox({ send, isOnline: () => online });
    expect(reloaded.pending()).toHaveLength(2);
    online = true;
    expect(await reloaded.flush()).toEqual({ sent: 2, failed: 0 });
    expect(send.mock.calls.map(([w]) => w.path)).toEqual(['/api/hotel/tasks/task-1', '/api/hotel/pets/pet-1/notes']);
    expect(reloaded.pending()).toEqual([]);
  });

  it('queues when the network drops mid-request', async () => {
    const send = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const outbox = createOutbox({ send, isOnline: () => true });
    expect(await outbox.submit({ method: 'PUT', path: '/api/hotel/tasks/task-1', body: { fed: true } })).toBe('queued');
  });

  it('drops a queued write the server rejects instead of retrying it forever', async () => {
    const { outbox } = setup();
    online = false;
    await outbox.submit({ method: 'PUT', path: '/api/hotel/tasks/task-1', body: { fed: true } });
    online = true;
    const rejecting = createOutbox({ send: async () => Promise.reject(Object.assign(new Error('Task is already completed'), { status: 409 })), isOnline: () => true });
    expect(await rejecting.flush()).toEqual({ sent: 0, failed: 1 });
    expect(rejecting.pending()).toEqual([]);
  });
});
