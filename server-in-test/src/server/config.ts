import { join } from 'node:path';

/** Test-support routes (data reset, clock pinning) are opt-in so a deployed server can't be wiped. */
export const testRoutesEnabled = (argv: readonly string[], env: Record<string, string | undefined>) =>
  argv.includes('--test-routes') || env.ENABLE_TEST_ROUTES === '1';

/** The hotel's IANA time zone, which decides what "today" means. Defaults to Oregon, where the seeded guests live. */
export const hotelTimeZone = (env: Record<string, string | undefined>) => env.HOTEL_TZ || 'America/Los_Angeles';

export type HotelStorage = { kind: 'memory' } | { kind: 'sqlite'; file: string; photosDir: string };

/** SQLite under `<root>/data` (or HOTEL_DATA_DIR) by default; HOTEL_STORAGE=memory keeps everything in memory. */
export function hotelStorage(env: Record<string, string | undefined>, root: string): HotelStorage {
  if (env.HOTEL_STORAGE === 'memory') return { kind: 'memory' };
  const dir = env.HOTEL_DATA_DIR || join(root, 'data');
  return { kind: 'sqlite', file: join(dir, 'hotel.db'), photosDir: join(dir, 'photos') };
}
