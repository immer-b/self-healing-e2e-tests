import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const appsRoot = resolve(__dirname, 'src/apps');

export default defineConfig({
  root: appsRoot,
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        login: resolve(appsRoot, 'login/index.html'),
        query: resolve(appsRoot, 'query/index.html'),
        report: resolve(appsRoot, 'report/index.html'),
        hotel: resolve(appsRoot, 'hotel/index.html'),
      },
    },
  },
  test: {
    root: __dirname,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    // The hotel UI tests drive full forms against a real in-process API.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/main.tsx', 'src/server/index.ts', 'src/apps/vite-env.d.ts'],
      reporter: ['text-summary', 'html'],
      // Floors for the pet hotel; the build fails if coverage drops below them.
      thresholds: {
        'src/server/hotel/**': { lines: 90, statements: 88, functions: 88 },
        'src/apps/hotel/**': { lines: 80, statements: 80, functions: 80 },
      },
    },
  },
});
