import { test, expect } from '../fixtures';

const SEEDED_NAMES = ['Alpha Project', 'Beta Launch', 'Gamma Audit', 'Delta Migration', 'Epsilon Research', 'Zeta Rollout'];

test.describe('results page', () => {
  test.beforeEach(async ({ resultsPage }) => {
    await resultsPage.goto();
  });

  test.describe('filtering', () => {
    test('lists every record with a result count', async ({ resultsPage }) => {
      await expect.poll(() => resultsPage.resultCount()).toBe(6);
      for (const name of SEEDED_NAMES) await expect(await resultsPage.row(name)).toBeVisible();
    });

    test('filters by free text', async ({ resultsPage }) => {
      await resultsPage.search('beta');
      await expect.poll(() => resultsPage.resultCount()).toBe(1);
      await expect(await resultsPage.rows()).toHaveCount(1);
      await expect(await resultsPage.row('Beta Launch')).toBeVisible();
    });

    test('filters by status', async ({ resultsPage }) => {
      await resultsPage.filterByStatus('pending');
      await expect.poll(() => resultsPage.resultCount()).toBe(2);
      await expect(await resultsPage.rows()).toHaveCount(2);
      await expect(await resultsPage.row('Gamma Audit')).toBeVisible();
      await expect(await resultsPage.row('Epsilon Research')).toBeVisible();
    });

    test('reports zero results when nothing matches', async ({ resultsPage }) => {
      await resultsPage.search('no-such-record');
      await expect.poll(() => resultsPage.resultCount()).toBe(0);
    });
  });

  test.describe('row CRUD via the row actions menu', () => {
    test('creates a record', async ({ resultsPage }) => {
      await resultsPage.createRecord({ name: 'Omega Pilot', owner: 'olga', status: 'pending', amount: 99 });
      const created = await resultsPage.row('Omega Pilot');
      await expect(created).toContainText('olga');
      await expect(created).toContainText('pending');
      await expect(created).toContainText('$99');
      await expect.poll(() => resultsPage.resultCount()).toBe(7);
    });

    test('reads a record’s details', async ({ resultsPage }) => {
      const details = await resultsPage.viewDetails('Beta Launch');
      await expect(details).toContainText('bob');
      await expect(details).toContainText('inactive');
      await expect(details).toContainText('$800');
    });

    test('updates a record', async ({ resultsPage }) => {
      await resultsPage.editRecord('Alpha Project', { name: 'Alpha Renamed', amount: 1500 });
      await expect(await resultsPage.row('Alpha Renamed')).toContainText('$1,500');
      await expect.poll(() => resultsPage.rowTexts()).not.toContainEqual(expect.stringContaining('Alpha Project'));
    });

    test('deletes a record after confirmation', async ({ resultsPage }) => {
      await resultsPage.deleteRecord('Gamma Audit');
      await expect.poll(() => resultsPage.resultCount()).toBe(5);
      await expect.poll(() => resultsPage.rowTexts()).not.toContainEqual(expect.stringContaining('Gamma Audit'));
    });

    for (const [name, owner] of [['Delta Migration', 'carol'], ['Zeta Rollout', 'bob']]) {
      test(`row actions work on any row: ${name}`, async ({ resultsPage }) => {
        await expect(await resultsPage.viewDetails(name)).toContainText(owner);
      });
    }
  });
});
