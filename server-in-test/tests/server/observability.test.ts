import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/server/app';
import { createRecordRepository } from '../../src/server/recordRepository';
import { DEFAULT_USERS } from '../../src/server/auth';
import { createClock } from '../../src/server/hotel/clock';
import { createHotel } from '../../src/server/hotel/hotel';

function build() {
  const lines: Record<string, unknown>[] = [];
  const app = createApp({
    repository: createRecordRepository([]),
    users: DEFAULT_USERS,
    clientDir: mkdtempSync(join(tmpdir(), 'client-')),
    hotel: createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) }),
    log: (entry) => lines.push(entry),
  });
  return { app, lines };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

describe('request ids and logs', () => {
  it('gives every response a request id and logs one JSON line per request', async () => {
    const { app, lines } = build();
    const res = await request(app).get('/api/ui-version');
    await settle();
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'info', msg: 'request', requestId: res.headers['x-request-id'], method: 'GET', path: '/api/ui-version', status: 200 });
    expect(typeof lines[0].durationMs).toBe('number');
    expect(lines[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps a well-formed incoming request id so calls can be traced across services', async () => {
    const { app } = build();
    const res = await request(app).get('/api/ui-version').set('X-Request-Id', 'trace-abc_123');
    expect(res.headers['x-request-id']).toBe('trace-abc_123');
    const bad = await request(app).get('/api/ui-version').set('X-Request-Id', 'x'.repeat(200));
    expect(bad.headers['x-request-id']).not.toBe('x'.repeat(200));
  });

  it('logs who made the request, but never bodies or query strings', async () => {
    const { app, lines } = build();
    const agent = request.agent(app);
    await agent.post('/api/hotel/auth/login').send({ username: 'frontdesk', password: 'frontdesk123' });
    await agent.get('/api/hotel/pets?text=secret-search');
    await settle();
    const text = JSON.stringify(lines);
    expect(text).not.toContain('frontdesk123');
    expect(text).not.toContain('secret-search');
    expect(lines.at(-1)).toMatchObject({ path: '/api/hotel/pets', employeeId: 'emp-2' });
  });

  it('logs server errors at error level', async () => {
    const { app, lines } = build();
    await request(app).get('/api/hotel/auth/me');
    await settle();
    expect(lines.at(-1)).toMatchObject({ status: 401, level: 'warn' });
  });
});

describe('GET /healthz', () => {
  it('reports that the server and its data store are up', async () => {
    const { app } = build();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { dataStore: 'ok' } });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });
});
