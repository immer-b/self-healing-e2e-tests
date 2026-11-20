import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    // Set PW_CHANNEL=chrome to drive an installed Google Chrome instead of bundled Chromium.
    channel: process.env.PW_CHANNEL || undefined,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'framework',
      testDir: './tests/integration',
    },
  ],
});
