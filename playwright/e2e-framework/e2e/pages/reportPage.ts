import type { Download, Page } from '@playwright/test';
import type { Healer } from '../../src';
import { click, numbersIn, textOf } from './actions';

export type Metric = 'totalRecords' | 'totalAmount' | 'averageAmount' | 'active' | 'inactive' | 'pending';

/** v1 selectors of each metric's value element. */
const METRIC_SELECTORS: Record<Metric, string> = {
  totalRecords: '#metric-total .value',
  totalAmount: '#metric-amount .value',
  averageAmount: '#metric-average .value',
  active: '#metric-active .value',
  inactive: '#metric-inactive .value',
  pending: '#metric-pending .value',
};


/**
 * Report page object. Selectors target UI v1 (metric cards + owner table); v2 (sidebar definition
 * list + owner list) and v3 (KPI tiles, bar chart, icon buttons) are healed. Metric values are
 * located by their labels because the numbers themselves change.
 */
export function createReportPage(page: Page, healer: Healer) {
  const ui = healer.forPage(page, 'report');

  const elements = {
    metric: (metric: Metric) => ui.locate({ key: `metric.${metric}`, selector: METRIC_SELECTORS[metric], dynamicText: true }),
    ownerRows: () => ui.locateAll({ key: 'ownerRows', selector: '#owner-table tbody tr' }),
    refreshButton: () => ui.locate({ key: 'refresh', selector: '#refresh-report' }),
    exportButton: () => ui.locate({ key: 'exportCsv', selector: '#export-csv' }),
  };

  return {
    goto: () => page.goto('/report/'),

    /** Numeric value of a metric, with currency formatting stripped. */
    metric: async (metric: Metric) => numbersIn(await textOf(() => elements.metric(metric)))[0],

    ownerCount: async () => (await elements.ownerRows()).count(),

    /** Record count and total amount for one owner, parsed from that owner's row. */
    ownerSummary: async (owner: string) => {
      const row = (await elements.ownerRows()).filter({ hasText: owner });
      const [count, amount] = numbersIn(await row.innerText());
      return { count, amount };
    },

    refresh: () => click(elements.refreshButton),

    exportCsv: async (): Promise<Download> => {
      const button = await elements.exportButton();
      const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
      return download;
    },
  };
}

export type ReportPage = ReturnType<typeof createReportPage>;
