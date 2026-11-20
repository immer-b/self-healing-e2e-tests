import { test as base, expect, type Page } from '@playwright/test';
import { startWorkerServer, useWorkerServerAsBaseURL } from '../workerServer';

/** The hotel app runs on a pinned date so seeded arrivals, departures and rounds are predictable. */
export const TODAY = '2026-11-20';

export const ACCOUNTS = {
  admin: { username: 'admin', password: 'password123', name: 'Morgan Reyes' },
  receiving: { username: 'frontdesk', password: 'frontdesk123', name: 'Priya Shah' },
  staff: { username: 'jordan', password: 'staff123', name: 'Jordan Lee' },
} as const;

export type Role = keyof typeof ACCOUNTS;

export async function signIn(page: Page, role: Role | { username: string; password: string }, path = '/hotel/') {
  const account = typeof role === 'string' ? ACCOUNTS[role] : role;
  await page.goto(path);
  await page.getByLabel('Username').fill(account.username);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

/**
 * Pet hotel end-to-end fixtures: every test starts from the seed on a pinned "today", and the
 * clock is released afterwards so the legacy sample apps are unaffected.
 */
export const test = base.extend<{ hotelServer: void }, { workerServer: string }>({
  workerServer: [startWorkerServer, { scope: 'worker' }],
  baseURL: useWorkerServerAsBaseURL,
  hotelServer: [
    async ({ request }, use) => {
      await request.put('/api/test/clock', { data: { now: `${TODAY}T08:00:00` } });
      await request.post('/api/test/reset');
      await use();
      await request.put('/api/test/clock', { data: { now: null } });
    },
    { auto: true },
  ],
});

export { expect };
