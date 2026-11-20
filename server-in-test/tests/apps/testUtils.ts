import { vi } from 'vitest';

export type RouteHandler = (init: RequestInit | undefined, url: URL) => { status?: number; body?: unknown };

/** Stubs global fetch with handlers keyed by "METHOD /path" (path may end with /* for prefix match). */
export function mockFetch(routes: Record<string, RouteHandler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = Object.keys(routes).find((route) => {
      const [m, path] = route.split(' ');
      if (m !== method) return false;
      return path.endsWith('/*') ? url.pathname.startsWith(path.slice(0, -1)) : url.pathname === path;
    });
    if (!key) throw new Error(`Unmocked request ${method} ${url.pathname}`);
    const { status = 200, body } = routes[key](init, url);
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
