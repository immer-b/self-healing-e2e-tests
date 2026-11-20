import type { Clock } from './clock';

export interface ThrottleOptions {
  maxFailures?: number;
  windowMs?: number;
  lockMs?: number;
}

/**
 * Brute-force protection for sign-in: `maxFailures` failed attempts for one key (username + IP)
 * inside `windowMs` lock that key for `lockMs`. Kept in memory, like the rest of the hotel data.
 */
export function createLoginThrottle(clock: Clock, { maxFailures = 5, windowMs = 15 * 60_000, lockMs = 15 * 60_000 }: ThrottleOptions = {}) {
  let failures = new Map<string, number[]>();
  let lockedUntil = new Map<string, number>();
  const now = () => clock.now().getTime();

  return {
    check: (key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } => {
      const until = lockedUntil.get(key);
      if (until === undefined) return { allowed: true };
      if (until <= now()) {
        lockedUntil.delete(key);
        failures.delete(key);
        return { allowed: true };
      }
      return { allowed: false, retryAfterSeconds: Math.ceil((until - now()) / 1000) };
    },
    fail: (key: string) => {
      const recent = (failures.get(key) ?? []).filter((at) => at > now() - windowMs);
      recent.push(now());
      failures.set(key, recent);
      if (recent.length >= maxFailures) lockedUntil.set(key, now() + lockMs);
    },
    succeed: (key: string) => {
      failures.delete(key);
      lockedUntil.delete(key);
    },
    reset: () => {
      failures = new Map();
      lockedUntil = new Map();
    },
  };
}

export type LoginThrottle = ReturnType<typeof createLoginThrottle>;
