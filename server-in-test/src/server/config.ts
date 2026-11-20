/** Test-support routes (data reset, clock pinning) are opt-in so a deployed server can't be wiped. */
export const testRoutesEnabled = (argv: readonly string[], env: Record<string, string | undefined>) =>
  argv.includes('--test-routes') || env.ENABLE_TEST_ROUTES === '1';

/** The hotel's IANA time zone, which decides what "today" means. Defaults to Oregon, where the seeded guests live. */
export const hotelTimeZone = (env: Record<string, string | undefined>) => env.HOTEL_TZ || 'America/Los_Angeles';
