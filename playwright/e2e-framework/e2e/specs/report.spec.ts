import { readFile } from 'node:fs/promises';
import { test, expect } from '../fixtures';

test.describe('report page', () => {
  test.beforeEach(async ({ reportPage }) => {
    await reportPage.goto();
  });

  test('shows summary metrics that match the API', async ({ reportPage, request }) => {
    const expected = await (await request.get('/api/report')).json();
    expect(await reportPage.metric('totalRecords')).toBe(expected.totalRecords);
    expect(await reportPage.metric('totalAmount')).toBe(expected.totalAmount);
    expect(await reportPage.metric('averageAmount')).toBe(expected.averageAmount);
  });

  test('shows record counts per status', async ({ reportPage }) => {
    expect(await reportPage.metric('active')).toBe(3);
    expect(await reportPage.metric('inactive')).toBe(1);
    expect(await reportPage.metric('pending')).toBe(2);
  });

  test('breaks totals down by owner', async ({ reportPage }) => {
    expect(await reportPage.ownerSummary('alice')).toEqual({ count: 2, amount: 1650 });
    expect(await reportPage.ownerSummary('bob')).toEqual({ count: 2, amount: 3000 });
    expect(await reportPage.ownerCount()).toBe(4);
  });

  test('refreshes to include newly created records', async ({ reportPage, request }) => {
    await request.post('/api/records', { data: { name: 'Eta Expansion', owner: 'erin', status: 'active', amount: 200 } });
    await reportPage.refresh();
    await expect.poll(() => reportPage.metric('totalRecords')).toBe(7);
    expect(await reportPage.metric('active')).toBe(4);
    expect(await reportPage.ownerSummary('erin')).toEqual({ count: 1, amount: 200 });
  });

  test('exports the report as CSV', async ({ reportPage }) => {
    const download = await reportPage.exportCsv();
    expect(download.suggestedFilename()).toBe('report.csv');
    const csv = await readFile((await download.path())!, 'utf8');
    expect(csv).toContain('totalRecords,6');
    expect(csv).toContain('alice,2,1650');
  });
});
