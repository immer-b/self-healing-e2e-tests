import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel, type Hotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';
import { HotelApp } from '../../../src/apps/hotel/HotelApp';
import { createUiVersionState, uiVersionRoutes } from '../../../src/server/routes/uiVersionRoutes';
import type { UiVersion } from '../../../src/server/types';

export const TODAY = '2026-11-20';

export const ACCOUNTS = {
  admin: ['admin', 'password123'],
  receiving: ['frontdesk', 'frontdesk123'],
  staff: ['jordan', 'staff123'],
} as const;

const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

/**
 * Runs the real hotel API on a random port and points the page's `fetch` at it, carrying the
 * session cookie like a browser would. Component tests therefore exercise real business rules.
 */
export async function startHotelApi(now = `${TODAY}T08:00:00`, uiVersion: UiVersion = 1) {
  const hotel = createHotel({ clock: createClock(new Date(now)) });
  const app = express()
    .use(express.json())
    .use('/api/hotel', hotelRoutes(hotel))
    .use('/api/ui-version', uiVersionRoutes(createUiVersionState(uiVersion)));
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const nodeFetch = globalThis.fetch;
  let cookie = '';

  const fetchStub = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const headers = new Headers(init.headers);
    if (cookie) headers.set('cookie', cookie);
    let body = init.body as unknown;
    if (body && typeof body === 'object' && 'arrayBuffer' in body) {
      body = Buffer.from(await (body as Blob).arrayBuffer());
    }
    const response = await nodeFetch(`${base}${url.pathname}${url.search}`, { ...init, headers, body: body as BodyInit });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      cookie = pair.endsWith('=') ? '' : pair;
    }
    return response;
  });
  vi.stubGlobal('fetch', fetchStub);
  return { hotel, fetch: fetchStub };
}

/** Renders the hotel app at `path` (relative to /hotel). */
export function renderAt(path = '/') {
  window.history.pushState({}, '', `/hotel${path === '/' ? '/' : path}`);
  const user = userEvent.setup();
  render(<HotelApp />);
  return { user };
}

/** Starts the API, renders the app and signs in as `role` (landing on that role's home page). */
export async function signInAs(role: keyof typeof ACCOUNTS, path = '/', now?: string, uiVersion: UiVersion = 1) {
  const api = await startHotelApi(now, uiVersion);
  const { user } = renderAt(path);
  const [username, password] = ACCOUNTS[role];
  await user.type(await screen.findByLabelText(/username/i), username);
  await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  await screen.findByRole('button', { name: /sign out/i }, { timeout: 5000 });
  return { ...api, user };
}

export const currentPath = () => window.location.pathname;

