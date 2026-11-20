import { expect } from '@playwright/test';
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
  /**
   * After every test (auto): v1 must not heal (the page-object selectors are correct) and v2/v3 must
   * heal (so a pass is not an accident of a selector still matching). Annotations must match events.
   */
  verifyHealing: void;
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

  verifyHealing: [
    async ({ healEvents, uiVersion }, use, testInfo) => {
      await use();
      if (testInfo.status !== testInfo.expectedStatus) return; // don't mask the real failure
      const annotations = testInfo.annotations.filter((a) => a.type === 'self-healed');
      expect(annotations, 'self-healed annotations').toHaveLength(healEvents.length);
      if (uiVersion === 1) expect(healEvents, 'v1 selectors should never need healing').toEqual([]);
      else expect(healEvents.length, `v${uiVersion} should be exercised through healed selectors`).toBeGreaterThan(0);
    },
    { auto: true },
  ],

  loginPage: async ({ page, healer }, use) => use(createLoginPage(page, healer)),
  resultsPage: async ({ page, healer }, use) => use(createResultsPage(page, healer)),
  reportPage: async ({ page, healer }, use) => use(createReportPage(page, healer)),
});

export { expect };
