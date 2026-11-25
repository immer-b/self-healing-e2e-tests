import type { Page } from '@playwright/test';
import { test, expect, signIn, type Role } from './fixtures';

/**
 * Visual regression for key hotel pages on the pinned clock. Run with VISUAL=1. Baselines are
 * committed from Linux CI only (fonts render differently per OS); see e2e-framework/README.md.
 */
const SCREENS: { name: string; role?: Role; path: string; open?: (page: Page) => Promise<void> }[] = [
  { name: 'sign-in', path: '/hotel/' },
  { name: 'today', role: 'receiving', path: '/hotel/today' },
  { name: 'schedule', role: 'receiving', path: '/hotel/schedule' },
  { name: 'pet-record', role: 'receiving', path: '/hotel/pets/pet-1' },
  { name: 'rooms', role: 'admin', path: '/hotel/rooms' },
  { name: 'queue', role: 'staff', path: '/hotel/queue' },
  {
    name: 'round',
    role: 'staff',
    path: '/hotel/queue',
    open: (page) => page.getByRole('list', { name: 'My rounds' }).getByRole('listitem').first().getByRole('link').click(),
  },
];

test.describe('visual regression', () => {
  for (const { name, role, path, open } of SCREENS) {
    test(name, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      if (role) await signIn(page, role, path);
      else await page.goto(path);
      await open?.(page);
      await page.waitForFunction(() => !document.querySelector('.loading'));
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.01,
        mask: [page.locator('.toasts')],
      });
    });
  }
});
