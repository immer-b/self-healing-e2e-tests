import { test as healingTest } from '../src/playwright/fixtures';
import { createLoginPage, type LoginPage } from './pages/loginPage';
import { createResultsPage, type ResultsPage } from './pages/resultsPage';
import { createReportPage, type ReportPage } from './pages/reportPage';

export interface E2eOptions {
  /** Which UI layout of the sample apps to test (selected via the ?v= query parameter). */
  uiVersion: 1 | 2 | 3;
}

interface E2eFixtures {
  loginPage: LoginPage;
  resultsPage: ResultsPage;
  reportPage: ReportPage;
  /** Resets the sample server's data before every test (auto). */
  resetData: void;
}

export const test = healingTest.extend<E2eOptions & E2eFixtures>({
  uiVersion: [1, { option: true }],

  resetData: [
    async ({ request }, use) => {
      await request.post('/api/test/reset');
      await use();
    },
    { auto: true },
  ],

  loginPage: async ({ page, healer, uiVersion }, use) => use(createLoginPage(page, healer, uiVersion)),
  resultsPage: async ({ page, healer, uiVersion }, use) => use(createResultsPage(page, healer, uiVersion)),
  reportPage: async ({ page, healer, uiVersion }, use) => use(createReportPage(page, healer, uiVersion)),
});

export { expect } from '@playwright/test';
