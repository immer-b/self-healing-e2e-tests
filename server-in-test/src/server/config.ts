/** Test-support routes (data reset, clock pinning) are opt-in so a deployed server can't be wiped. */
export const testRoutesEnabled = (argv: readonly string[], env: Record<string, string | undefined>) =>
  argv.includes('--test-routes') || env.ENABLE_TEST_ROUTES === '1';
