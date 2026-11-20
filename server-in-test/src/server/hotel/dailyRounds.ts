import type { Actor } from './auditLog';
import type { Hotel } from './hotel';

export const SCHEDULER_ACTOR: Actor = { id: 'scheduler', name: 'Scheduler' };
export const DAILY_ROUNDS_AT = 6 * 60; // 6:00 AM hotel time

/**
 * Generates each day's care rounds for all active general staff once the hotel clock passes
 * `atMinutes`, so nobody has to remember to press Generate. Runs at most once per date and
 * catches up if the server starts later in the day. The front desk can still rebalance.
 */
export function createDailyRounds(hotel: Hotel, { atMinutes = DAILY_ROUNDS_AT, everyMs = 60_000 } = {}) {
  let lastRunDate: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  /** Returns the number of rounds created when the job ran, undefined when it had nothing to do. */
  const tick = (): number | undefined => {
    const today = hotel.clock.today();
    if (lastRunDate === today || hotel.clock.minutesIntoDay() < atMinutes) return undefined;
    lastRunDate = today;
    const result = hotel.tasks.generate(today, undefined, SCHEDULER_ACTOR);
    return result.ok ? result.value.length : 0;
  };

  return {
    tick,
    start: () => {
      tick();
      timer ??= setInterval(tick, everyMs);
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
