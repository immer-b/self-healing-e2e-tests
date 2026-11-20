import { test as healingTest } from '../src';
import { createLoginPage, type LoginPage } from './pages/loginPage';
import { createResultsPage, type ResultsPage } from './pages/resultsPage';
import { createReportPage, type ReportPage } from './pages/reportPage';

export interface E2eOptions {
  /** Which UI layout of the sample apps to test (set on the server via PUT /api/ui-version). */
  uiVersion: 1 | 2 | 3;
}

interface E2eFixtures {
  loginPage: LoginPage;
  resultsPage: ResultsPage;
  reportPage: ReportPage;
  /** Resets the sample server's data and selects `uiVersion` before every test (auto). */
  prepareServer: void;
}

export const test = healingTest.extend<E2eOptions & E2eFixtures>({
  uiVersion: [1, { option: true }],

  prepareServer: [
    async ({ request, uiVersion }, use) => {
      await request.post('/api/test/reset');
      await request.put('/api/ui-version', { data: { version: uiVersion } });
      await use();
    },
    { auto: true },
  ],

  loginPage: async ({ page, healer }, use) => use(createLoginPage(page, healer)),
  resultsPage: async ({ page, healer }, use) => use(createResultsPage(page, healer)),
  reportPage: async ({ page, healer }, use) => use(createReportPage(page, healer)),
});

export { expect } from '@playwright/test';
