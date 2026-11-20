import { test, expect } from '../fixtures';

test.describe('login page', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test('signs in with valid credentials and greets the user', async ({ loginPage }) => {
    await loginPage.login('admin', 'password123');
    await expect(await loginPage.welcomeMessage()).toContainText('Administrator');
  });

  test('shows an error for invalid credentials', async ({ loginPage }) => {
    await loginPage.login('admin', 'wrong-password');
    await expect(await loginPage.errorMessage()).toHaveText('Invalid username or password');
  });

  test('requires both username and password', async ({ loginPage }) => {
    await loginPage.submit();
    await expect(await loginPage.errorMessage()).toHaveText('Username and password are required');
  });

  test('heals v1 selectors only when the UI has changed', async ({ loginPage, healEvents, uiVersion }) => {
    await loginPage.login('admin', 'password123');
    await loginPage.welcomeMessage();
    const healedKeys = healEvents.map((e) => e.elementKey);
    if (uiVersion === 1) expect(healedKeys).toEqual([]);
    else expect(healedKeys).toEqual(expect.arrayContaining(['username', 'password', 'submit', 'welcomeMessage']));
  });

  test('navigates to the results page after signing in', async ({ loginPage, page, uiVersion }) => {
    await loginPage.login('admin', 'password123');
    await loginPage.openResults();
    await expect(page).toHaveURL(new RegExp(`/query/\\?v=${uiVersion}$`));
  });
});
