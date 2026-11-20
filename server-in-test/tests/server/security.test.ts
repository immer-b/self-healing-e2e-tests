import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/server/app';
import { createRecordRepository } from '../../src/server/recordRepository';
import { DEFAULT_USERS } from '../../src/server/auth';
import { createClock } from '../../src/server/hotel/clock';
import { createHotel } from '../../src/server/hotel/hotel';

function build() {
  const clientDir = mkdtempSync(join(tmpdir(), 'client-'));
  mkdirSync(join(clientDir, 'hotel'));
  writeFileSync(join(clientDir, 'hotel', 'index.html'), '<html>hotel</html>');
  return createApp({
    repository: createRecordRepository([]),
    users: DEFAULT_USERS,
    clientDir,
    hotel: createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) }),
  });
}

describe('security headers', () => {
  it('are sent on pages and API responses', async () => {
    const app = build();
    for (const path of ['/hotel/', '/api/ui-version']) {
      const res = await request(app).get(path);
      expect(res.headers['x-content-type-options'], path).toBe('nosniff');
      expect(res.headers['referrer-policy'], path).toBe('same-origin');
      expect(res.headers['x-frame-options'], path).toBe('DENY');
      const csp = res.headers['content-security-policy'];
      expect(csp, path).toContain("default-src 'self'");
      expect(csp).toContain("img-src 'self' blob: data:");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(res.headers['x-powered-by'], path).toBeUndefined();
    }
  });
});

describe('cross-origin writes', () => {
  it('rejects state-changing hotel requests from another origin', async () => {
    const res = await request(build())
      .post('/api/hotel/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ username: 'admin', password: 'password123' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Cross-origin request blocked');
  });

  it('allows same-origin writes and requests without an Origin header', async () => {
    const app = build();
    const same = await request(app)
      .post('/api/hotel/auth/login')
      .set('Host', 'hotel.local:3000')
      .set('Origin', 'http://hotel.local:3000')
      .send({ username: 'admin', password: 'password123' });
    expect(same.status).toBe(200);
    expect((await request(app).post('/api/hotel/auth/login').send({ username: 'admin', password: 'password123' })).status).toBe(200);
  });

  it('does not block cross-origin reads', async () => {
    const res = await request(build()).get('/api/hotel/auth/me').set('Origin', 'https://evil.example');
    expect(res.status).toBe(401); // reached the auth check, not the origin check
  });
});
