import { defineConfig } from 'vitest/config';

/** Used by Stryker (npm run mutation): only the server-side hotel tests, which cover the mutated modules. */
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['tests/server/hotel/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20_000,
  },
});
