import { randomBytes } from 'node:crypto';
import type { Clock } from './clock';

export const SESSION_COOKIE = 'hotel_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // one long shift

/** Opaque random session tokens mapped to employee ids, expiring after `ttlMs`. */
export function createSessionStore(clock: Clock, ttlMs = SESSION_TTL_MS) {
  let sessions = new Map<string, { employeeId: string; expiresAt: number }>();
  return {
    create: (employeeId: string) => {
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { employeeId, expiresAt: clock.now().getTime() + ttlMs });
      return token;
    },
    resolve: (token: string | undefined) => {
      const session = token ? sessions.get(token) : undefined;
      if (!session) return undefined;
      if (session.expiresAt <= clock.now().getTime()) {
        sessions.delete(token!);
        return undefined;
      }
      return session.employeeId;
    },
    revoke: (token: string | undefined) => {
      if (token) sessions.delete(token);
    },
    reset: () => {
      sessions = new Map();
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}
