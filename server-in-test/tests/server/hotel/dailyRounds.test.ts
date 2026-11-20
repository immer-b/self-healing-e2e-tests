import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';
import { createDailyRounds, SCHEDULER_ACTOR } from '../../../src/server/hotel/dailyRounds';

const TOMORROW = '2026-11-21';

function setup() {
  const clock = createClock(new Date('2026-11-20T08:00:00'));
  const hotel = createHotel({ clock });
  return { clock, hotel, job: createDailyRounds(hotel) };
}

afterEach(() => vi.useRealTimers());

describe('daily rounds job', () => {
  it('does nothing before 6:00 AM', () => {
    const { clock, hotel, job } = setup();
    clock.set(new Date(`${TOMORROW}T05:59:00`));
    expect(job.tick()).toBeUndefined();
    expect(hotel.tasks.list({ date: TOMORROW })).toEqual([]);
  });

  it('generates the day’s rounds for all active staff at 6:00, once per day', () => {
    const { clock, hotel, job } = setup();
    clock.set(new Date(`${TOMORROW}T06:00:00`));
    expect(job.tick()).toBe(9);
    const tasks = hotel.tasks.list({ date: TOMORROW });
    expect(tasks).toHaveLength(9);
    expect(new Set(tasks.map((t) => t.assigneeId))).toEqual(new Set(['emp-3', 'emp-4', 'emp-5']));
    expect(tasks[0].createdBy).toEqual(SCHEDULER_ACTOR);
    clock.set(new Date(`${TOMORROW}T09:00:00`));
    expect(job.tick()).toBeUndefined();
  });

  it('catches up when the server starts later in the day', () => {
    const { clock, job } = setup();
    clock.set(new Date(`${TOMORROW}T14:00:00`));
    expect(job.tick()).toBe(9);
  });

  it('runs again the next day', () => {
    const { clock, job } = setup();
    clock.set(new Date(`${TOMORROW}T06:30:00`));
    job.tick();
    clock.set(new Date('2026-11-22T06:30:00'));
    expect(job.tick()).toBeGreaterThan(0);
  });

  it('checks every minute once started and stops cleanly', () => {
    vi.useFakeTimers();
    const { clock, hotel, job } = setup();
    clock.set(new Date(`${TOMORROW}T05:59:00`));
    job.start();
    expect(hotel.tasks.list({ date: TOMORROW })).toEqual([]);
    clock.set(new Date(`${TOMORROW}T06:00:00`));
    vi.advanceTimersByTime(60_000);
    expect(hotel.tasks.list({ date: TOMORROW })).toHaveLength(9);
    job.stop();
  });

  it('skips a day when nobody is on staff instead of crashing', () => {
    const { clock, hotel, job } = setup();
    for (const id of ['emp-3', 'emp-4', 'emp-5']) hotel.employees.remove(id, { id: 'emp-1', name: 'Morgan Reyes' });
    clock.set(new Date(`${TOMORROW}T06:00:00`));
    expect(job.tick()).toBe(9); // rounds are created unassigned for the front desk to hand out
    expect(hotel.tasks.list({ date: TOMORROW }).every((t) => t.assigneeId === null)).toBe(true);
  });
});
