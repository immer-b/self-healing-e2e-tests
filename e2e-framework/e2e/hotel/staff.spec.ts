import { test, expect, signIn } from './fixtures';

// 1×1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test.describe('general staff', () => {
  test('works through a round: checklist, photo, note, complete, back to the queue', async ({ page }) => {
    await signIn(page, 'staff');
    await expect(page.getByRole('heading', { level: 1, name: 'My rounds' })).toBeVisible();
    await expect(page.getByText('0 of 3 done')).toBeVisible();
    const queue = page.getByRole('list', { name: 'My rounds' });
    await queue.getByRole('listitem').first().getByRole('link').click();

    await expect(page.getByRole('heading', { level: 1, name: 'Biscuit' })).toBeVisible();
    await expect(page.getByRole('note', { name: 'Special instructions' })).toContainText('Grain-free kibble');
    await expect(page.getByRole('region', { name: 'Emergency contacts' })).toContainText('(503) 555-0101');
    const complete = page.getByRole('button', { name: 'Complete round' });
    await expect(complete).toBeDisabled();

    await page.getByRole('checkbox', { name: 'Room cleaned' }).check();
    await page.getByRole('checkbox', { name: 'Fed' }).check();
    await page.getByLabel('Photo of the pet in the room').setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('img', { name: 'Biscuit in E-101' })).toBeVisible();
    const notes = page.getByRole('region', { name: 'Notes' });
    await notes.getByLabel('New note').fill('Ate everything. Water refilled twice.');
    await notes.getByRole('button', { name: 'Add note' }).click();
    await expect(notes.getByRole('listitem').first()).toContainText('Care round');

    await complete.click();
    await expect(page).toHaveURL(/\/hotel\/queue$/);
    await expect(page.getByText('1 of 3 done')).toBeVisible();
    await expect(queue.getByRole('listitem').last()).toContainText('Done');
  });

  test('the front desk sees the completed round on the schedule', async ({ page, browser }) => {
    await signIn(page, 'staff');
    await page.getByRole('list', { name: 'My rounds' }).getByRole('listitem').first().getByRole('link').click();
    await page.getByRole('checkbox', { name: 'Room cleaned' }).check();
    await page.getByRole('checkbox', { name: 'Fed' }).check();
    await page.getByLabel('Photo of the pet in the room').setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('button', { name: 'Complete round' })).toBeEnabled();
    await page.getByRole('button', { name: 'Complete round' }).click();
    await expect(page.getByText('1 of 3 done')).toBeVisible();

    const desk = await browser.newPage();
    await signIn(desk, 'receiving', '/hotel/schedule');
    await expect(desk.getByRole('row', { name: /Morning.*Biscuit.*Done/ })).toBeVisible();
    await expect(desk.getByRole('region', { name: 'Workload' }).getByRole('group', { name: 'Jordan Lee' })).toContainText('1 of 3 done');
    await desk.close();
  });

  test('cannot open front desk or admin pages', async ({ page }) => {
    await signIn(page, 'staff');
    for (const path of ['/hotel/employees', '/hotel/pets', '/hotel/schedule']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: 'My rounds' })).toBeVisible();
    }
    expect((await page.request.get('/api/hotel/pets')).status()).toBe(403);
  });
});
