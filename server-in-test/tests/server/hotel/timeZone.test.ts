import { describe, expect, it } from 'vitest';
import { createClock } from '../../../src/server/hotel/clock';
import { hotelTimeZone } from '../../../src/server/config';

describe('hotel time zone', () => {
  const instant = new Date('2026-11-21T03:30:00Z'); // evening of the 20th in Oregon, morning of the 21st in Tokyo

  it('reports "today" in the hotel’s time zone, not the server’s', () => {
    expect(createClock(instant, 'America/Los_Angeles').today()).toBe('2026-11-20');
    expect(createClock(instant, 'Asia/Tokyo').today()).toBe('2026-11-21');
    expect(createClock(instant, 'UTC').today()).toBe('2026-11-21');
  });

  it('reports minutes since midnight in the hotel’s time zone', () => {
    expect(createClock(instant, 'America/Los_Angeles').minutesIntoDay()).toBe(19 * 60 + 30);
    expect(createClock(instant, 'UTC').minutesIntoDay()).toBe(3 * 60 + 30);
  });

  it('uses local time when no zone is given', () => {
    const local = new Date('2026-11-20T09:15:00');
    expect(createClock(local).today()).toBe('2026-11-20');
    expect(createClock(local).minutesIntoDay()).toBe(9 * 60 + 15);
  });

  it('rejects unknown zones up front', () => {
    expect(() => createClock(instant, 'Mars/Olympus_Mons')).toThrow(/time zone/i);
  });

  it('reads HOTEL_TZ, defaulting to Oregon', () => {
    expect(hotelTimeZone({})).toBe('America/Los_Angeles');
    expect(hotelTimeZone({ HOTEL_TZ: 'Europe/London' })).toBe('Europe/London');
  });
});
