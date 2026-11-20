import { test, expect, signIn } from './fixtures';

test.describe('admin', () => {
  test('adds a front desk employee who can then sign in with front desk access', async ({ page }) => {
    await signIn(page, 'admin', '/hotel/employees');
    await page.getByRole('button', { name: 'New employee' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Full name').fill('Casey Nguyen');
    await dialog.getByLabel('Username').fill('casey');
    await dialog.getByLabel('Temporary password').fill('welcome123');
    await dialog.getByLabel('Role').selectOption('receiving');
    await dialog.getByLabel('Job type').selectOption('front_desk');
    await dialog.getByRole('button', { name: 'Add employee' }).click();
    await expect(page.getByRole('row', { name: /Casey Nguyen/ })).toContainText('Front desk');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await signIn(page, { username: 'casey', password: 'welcome123' });
    // a temporary password must be replaced before anything else
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await page.getByLabel('Current password').fill('welcome123');
    await page.getByLabel('New password', { exact: true }).fill('caseys-own-pw');
    await page.getByLabel('Confirm new password').fill('caseys-own-pw');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(['Today', 'Schedule', 'Pets', 'Owners', 'Rooms']);
  });

  test('archives an employee, who can no longer sign in, and sees it in the change log', async ({ page }) => {
    await signIn(page, 'admin', '/hotel/employees');
    await page.getByRole('row', { name: /Alex Chen/ }).getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archive employee' }).click();
    await expect(page.getByRole('row', { name: /Alex Chen/ })).toHaveCount(0);

    await page.getByRole('link', { name: 'Change log' }).click();
    const latest = page.getByRole('row').nth(1);
    await expect(latest).toContainText('Archived');
    await expect(latest).toContainText('Alex Chen');
    await expect(latest).toContainText('Morgan Reyes');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByLabel('Username').fill('alex');
    await page.getByLabel('Password').fill('staff123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid username or password');
  });
});
