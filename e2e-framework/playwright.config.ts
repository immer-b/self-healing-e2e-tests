import { defineConfig, devices } from '@playwright/test';
import type { E2eOptions } from './e2e/fixtures';

const PORT = Number(process.env.APP_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig<E2eOptions>({
  timeout: 60_000,
  expect: { timeout: 5_000 },
  // The sample server keeps state in memory and tests reset it, so run serially.
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    // Set PW_CHANNEL=chrome to drive an installed Google Chrome instead of bundled Chromium.
    channel: process.env.PW_CHANNEL || undefined,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run serve',
    cwd: '../server-in-test',
    url: `${BASE_URL}/api/report`,
    // A throwaway SQLite folder, so e2e runs exercise persistence without touching dev data.
    env: { PORT: String(PORT), HOTEL_DATA_DIR: '.e2e-data' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    // Unit-level browser tests of the healing engine against inline HTML fixtures.
    { name: 'framework', testDir: './tests/integration' },

    // v1 is the UI the page objects were written for: selectors match and baselines are recorded.
    { name: 'v1-baseline', testDir: './e2e/specs', use: { uiVersion: 1 } },

    // v2 / v3 changed the markup: the same page objects must self-heal using the v1 baselines.
    { name: 'v2-healed', testDir: './e2e/specs', use: { uiVersion: 2 }, dependencies: ['v1-baseline'] },
    { name: 'v3-healed', testDir: './e2e/specs', use: { uiVersion: 3 }, dependencies: ['v1-baseline'] },

    // The pet hotel staff app: admin, front desk and general staff journeys in a real browser.
    { name: 'hotel', testDir: './e2e/hotel' },

    // General staff work on phones: the same staff journeys on a Pixel 7 viewport with touch.
    { name: 'hotel-mobile', testDir: './e2e/hotel', testMatch: /staff\.spec\.ts/, use: { ...devices['Pixel 7'] } },
  ],
});
