import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';
import { isOverdue } from '../../../src/server/hotel/scheduling';

const TODAY = '2026-11-20';

describe('isOverdue', () => {
  const task = (date: string, slot: 'morning' | 'evening', status: 'pending' | 'completed' = 'pending') => ({ date, slot, status });

  it('flags a pending round more than two hours past its slot time', () => {
    expect(isOverdue(task(TODAY, 'morning'), TODAY, 10 * 60)).toBe(false); // 10:00 exactly: still on time
    expect(isOverdue(task(TODAY, 'morning'), TODAY, 10 * 60 + 1)).toBe(true);
    expect(isOverdue(task(TODAY, 'evening'), TODAY, 18 * 60)).toBe(false);
    expect(isOverdue(task(TODAY, 'evening'), TODAY, 19 * 60 + 1)).toBe(true);
  });

  it('flags pending rounds from earlier days and never future or completed ones', () => {
    expect(isOverdue(task('2026-11-19', 'evening'), TODAY, 0)).toBe(true);
    expect(isOverdue(task('2026-11-21', 'morning'), TODAY, 23 * 60)).toBe(false);
    expect(isOverdue(task(TODAY, 'morning', 'completed'), TODAY, 23 * 60)).toBe(false);
  });
});

describe('overdue rounds over HTTP', () => {
  const setup = async (time: string) => {
    const hotel = createHotel({ clock: createClock(new Date(`${TODAY}T${time}`)) });
    const app = express().use(express.json()).use('/api/hotel', hotelRoutes(hotel));
    const agent = request.agent(app);
    await agent.post('/api/hotel/auth/login').send({ username: 'frontdesk', password: 'frontdesk123' });
    return agent;
  };

  it('marks overdue rounds on the board and counts them on the dashboard', async () => {
    const agent = await setup('10:30:00');
    const board = (await agent.get(`/api/hotel/tasks?date=${TODAY}`)).body as { slot: string; overdue: boolean }[];
    expect(board.filter((t) => t.slot === 'morning').every((t) => t.overdue)).toBe(true);
    expect(board.filter((t) => t.slot === 'evening').some((t) => t.overdue)).toBe(false);
    expect((await agent.get(`/api/hotel/dashboard?date=${TODAY}`)).body.tasks.overdue).toBe(4);
  });

  it('reports nothing overdue early in the morning', async () => {
    const agent = await setup('08:00:00');
    expect((await agent.get(`/api/hotel/dashboard?date=${TODAY}`)).body.tasks.overdue).toBe(0);
  });
});
