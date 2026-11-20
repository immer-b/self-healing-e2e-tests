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
import { testRoutesEnabled } from '../../src/server/config';

const build = (enableTestRoutes?: boolean) =>
  createApp({
    repository: createRecordRepository([]),
    users: DEFAULT_USERS,
    clientDir: mkdtempSync(join(tmpdir(), 'client-')),
    hotel: createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) }),
    enableTestRoutes,
  });

describe('test-support routes', () => {
  it('are off by default, so a deployed server cannot be reset', async () => {
    const app = build();
    expect((await request(app).post('/api/test/reset')).status).toBe(404);
    expect((await request(app).put('/api/test/clock').send({ now: null })).status).toBe(404);
  });

  it('are available when enabled', async () => {
    const app = build(true);
    expect((await request(app).post('/api/test/reset')).status).toBe(204);
  });
});

describe('testRoutesEnabled', () => {
  it('is enabled by the --test-routes flag or ENABLE_TEST_ROUTES=1', () => {
    expect(testRoutesEnabled(['node', 'index.ts'], {})).toBe(false);
    expect(testRoutesEnabled(['node', 'index.ts', '--test-routes'], {})).toBe(true);
    expect(testRoutesEnabled(['node', 'index.ts'], { ENABLE_TEST_ROUTES: '1' })).toBe(true);
    expect(testRoutesEnabled(['node', 'index.ts'], { ENABLE_TEST_ROUTES: '0' })).toBe(false);
  });
});
