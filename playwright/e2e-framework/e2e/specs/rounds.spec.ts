import { test, expect } from '../fixtures';
import { createRoundsPage } from '../pages/roundsPage';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** The pet hotel's staff rounds pages, healed across the three runtime layouts. */
test.describe('pet hotel rounds', () => {
  test.beforeEach(async ({ request }) => {
    // Seeded rounds are relative to "today": pin it so every run sees the same three rounds.
    await request.put('/api/test/clock', { data: { now: '2026-11-20T08:00:00' } });
    await request.post('/api/test/reset');
  });
  test.afterEach(async ({ request }) => {
    await request.put('/api/test/clock', { data: { now: null } });
  });

  test('shows the carer’s rounds and progress', async ({ page, healer }) => {
    const rounds = createRoundsPage(page, healer);
    await rounds.signIn();
    await expect.poll(() => rounds.progress()).toEqual([0, 3]);
    await expect(await rounds.rounds()).toHaveCount(3);
  });

  test('opens a round with the pet’s special instructions', async ({ page, healer }) => {
    const rounds = createRoundsPage(page, healer);
    await rounds.signIn();
    await rounds.openRound(0);
    await expect(await rounds.instructions()).toContainText('Grain-free kibble');
    await expect(await rounds.completeButton()).toBeDisabled();
  });

  test('completes a round and returns to the queue', async ({ page, healer }) => {
    const rounds = createRoundsPage(page, healer);
    await rounds.signIn();
    await rounds.openRound(0);
    await rounds.markCleaned();
    await rounds.markFed();
    await rounds.attachPhoto(PNG);
    await expect(await rounds.completeButton()).toBeEnabled();
    await rounds.complete();
    await expect(page).toHaveURL(/\/hotel\/queue$/);
    await expect.poll(() => rounds.progress()).toEqual([1, 3]);
  });
});
