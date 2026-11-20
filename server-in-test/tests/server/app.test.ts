import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/server/app';
import { createRecordRepository } from '../../src/server/recordRepository';
import { DEFAULT_USERS } from '../../src/server/auth';
import type { RecordInput } from '../../src/server/types';

const seed: RecordInput[] = [
  { name: 'Alpha Project', owner: 'alice', status: 'active', amount: 100 },
  { name: 'Beta Launch', owner: 'bob', status: 'inactive', amount: 250 },
];

function makeClientDir() {
  const dir = mkdtempSync(join(tmpdir(), 'client-'));
  for (const app of ['login', 'query', 'report']) {
    mkdirSync(join(dir, app));
    writeFileSync(join(dir, app, 'index.html'), `<html><head></head><body>${app} app</body></html>`);
  }
  return dir;
}

describe('HTTP API', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    app = createApp({ repository: createRecordRepository(seed), users: DEFAULT_USERS, clientDir: makeClientDir() });
  });

  describe('POST /api/login', () => {
    it('returns a token for valid credentials', async () => {
      const res = await request(app).post('/api/login').send({ username: 'admin', password: 'password123' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.displayName).toBe('Administrator');
    });

    it('returns 401 with an error for invalid credentials', async () => {
      const res = await request(app).post('/api/login').send({ username: 'admin', password: 'bad' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid username or password');
    });
  });

  describe('records', () => {
    it('lists and filters records', async () => {
      expect((await request(app).get('/api/records')).body).toHaveLength(2);
      const res = await request(app).get('/api/records').query({ text: 'beta', status: 'inactive' });
      expect(res.body.map((r: { name: string }) => r.name)).toEqual(['Beta Launch']);
    });

    it('gets a single record or 404', async () => {
      expect((await request(app).get('/api/records/1')).body.name).toBe('Alpha Project');
      expect((await request(app).get('/api/records/99')).status).toBe(404);
    });

    it('creates a valid record', async () => {
      const res = await request(app)
        .post('/api/records')
        .send({ name: 'Gamma', owner: 'carol', status: 'pending', amount: 5 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: '3', name: 'Gamma' });
    });

    it('rejects an invalid record with field errors', async () => {
      const res = await request(app).post('/api/records').send({ name: '', owner: 'x', status: 'weird', amount: -1 });
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.errors).sort()).toEqual(['amount', 'name', 'status']);
    });

    it('updates a record, validating fields', async () => {
      const res = await request(app).put('/api/records/1').send({ name: 'Alpha Renamed' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Alpha Renamed');
      expect((await request(app).put('/api/records/1').send({ amount: 'lots' })).status).toBe(400);
      expect((await request(app).put('/api/records/99').send({ name: 'x' })).status).toBe(404);
    });

    it('deletes a record', async () => {
      expect((await request(app).delete('/api/records/1')).status).toBe(204);
      expect((await request(app).delete('/api/records/1')).status).toBe(404);
    });
  });

  it('GET /api/report summarises current records', async () => {
    const res = await request(app).get('/api/report');
    expect(res.body).toMatchObject({ totalRecords: 2, totalAmount: 350, byStatus: { active: 1, inactive: 1, pending: 0 } });
  });

  it('POST /api/test/reset restores the seed data', async () => {
    await request(app).delete('/api/records/1');
    expect((await request(app).post('/api/test/reset')).status).toBe(204);
    expect((await request(app).get('/api/records')).body).toHaveLength(2);
  });

  describe('UI version', () => {
    it('starts at version 1', async () => {
      expect((await request(app).get('/api/ui-version')).body).toEqual({ version: 1 });
    });

    it('changes the version at runtime', async () => {
      const res = await request(app).put('/api/ui-version').send({ version: 3 });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ version: 3 });
      expect((await request(app).get('/api/ui-version')).body).toEqual({ version: 3 });
    });

    it.each([{ version: 9 }, { version: '2' }, {}])('rejects an invalid version %j', async (body) => {
      const res = await request(app).put('/api/ui-version').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/1, 2 or 3/);
      expect((await request(app).get('/api/ui-version')).body).toEqual({ version: 1 });
    });

    it('is not affected by the data reset', async () => {
      await request(app).put('/api/ui-version').send({ version: 2 });
      await request(app).post('/api/test/reset');
      expect((await request(app).get('/api/ui-version')).body).toEqual({ version: 2 });
    });
  });

  describe('single page apps', () => {
    it.each(['login', 'query', 'report'])('serves the %s app with deep-link fallback', async (name) => {
      expect((await request(app).get(`/${name}/`)).text).toContain(`${name} app`);
      expect((await request(app).get(`/${name}/some/deep/link`)).text).toContain(`${name} app`);
    });

    it('redirects / to the login app', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login/');
    });
  });
});
