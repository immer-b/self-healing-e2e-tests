import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createClock } from '../../../src/server/hotel/clock';
import { createAuditLog } from '../../../src/server/hotel/auditLog';
import { createHotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';

const actor = { id: 'emp-1', name: 'Morgan Reyes' };

describe('audit log paging and dates', () => {
  function filled() {
    const clock = createClock(new Date('2026-11-18T10:00:00'));
    const audit = createAuditLog(clock);
    for (const day of ['18', '19', '20']) {
      clock.set(new Date(`2026-11-${day}T10:00:00`));
      for (let i = 0; i < 3; i++) audit.record({ entityType: 'pet', entityId: `pet-${day}-${i}`, action: 'update', actor, changes: [] });
    }
    return audit;
  }

  it('pages backwards from a cursor', () => {
    const audit = filled();
    const first = audit.list({ limit: 4 });
    expect(first.map((e) => e.id)).toEqual(['aud-9', 'aud-8', 'aud-7', 'aud-6']);
    expect(audit.list({ limit: 4, before: 'aud-6' }).map((e) => e.id)).toEqual(['aud-5', 'aud-4', 'aud-3', 'aud-2']);
    expect(audit.list({ limit: 4, before: 'aud-2' }).map((e) => e.id)).toEqual(['aud-1']);
  });

  it('filters by an inclusive date range in the hotel’s calendar', () => {
    const audit = filled();
    expect(audit.list({ from: '2026-11-19', to: '2026-11-19' }).map((e) => e.entityId)).toEqual(['pet-19-2', 'pet-19-1', 'pet-19-0']);
    expect(audit.list({ from: '2026-11-20' })).toHaveLength(3);
    expect(audit.list({ to: '2026-11-18' })).toHaveLength(3);
  });
});

describe('GET /api/hotel/audit paging', () => {
  async function admin() {
    const hotel = createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) });
    const app = express().use(express.json()).use('/api/hotel', hotelRoutes(hotel));
    const agent = request.agent(app);
    await agent.post('/api/hotel/auth/login').send({ username: 'admin', password: 'password123' });
    return agent;
  }

  it('returns 50 entries per page with a cursor for the next page', async () => {
    const agent = await admin();
    const page1 = await agent.get('/api/hotel/audit');
    expect(page1.body).toHaveLength(50);
    const cursor = page1.headers['x-next-cursor'];
    expect(cursor).toBe(page1.body.at(-1).id);
    const page2 = await agent.get(`/api/hotel/audit?before=${cursor}`);
    expect(page2.body.length).toBeGreaterThan(0);
    expect(page2.body[0].id).not.toBe(page1.body.at(-1).id);
    expect(page2.headers['x-next-cursor']).toBeUndefined();
  });

  it('filters by date and rejects bad dates', async () => {
    const agent = await admin();
    expect((await agent.get('/api/hotel/audit?from=2026-11-21')).body).toEqual([]);
    expect((await agent.get('/api/hotel/audit?from=2026-11-20&to=2026-11-20&limit=5')).body).toHaveLength(5);
    expect((await agent.get('/api/hotel/audit?from=yesterday')).status).toBe(400);
  });
});
