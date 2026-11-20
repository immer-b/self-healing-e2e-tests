import { defineConfig } from 'vite';
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
      },
    },
  },
  test: {
    root: __dirname,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
});
