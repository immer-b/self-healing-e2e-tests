import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect, signIn, type Role } from './fixtures';

/** Pages to audit per role, with an optional step that opens a dialog or a detail view. */
const PAGES: { role?: Role; path: string; name: string; open?: (page: Page) => Promise<void> }[] = [
  { path: '/hotel/', name: 'sign in' },
  { role: 'receiving', path: '/hotel/today', name: 'today' },
  { role: 'receiving', path: '/hotel/schedule', name: 'care schedule' },
  { role: 'receiving', path: '/hotel/pets', name: 'pets' },
  { role: 'receiving', path: '/hotel/pets/pet-1', name: 'pet record' },
  { role: 'receiving', path: '/hotel/owners', name: 'owners' },
  {
    role: 'receiving',
    path: '/hotel/owners',
    name: 'new owner dialog',
    open: (page) => page.getByRole('button', { name: 'New owner' }).click(),
  },
  { role: 'receiving', path: '/hotel/rooms', name: 'rooms' },
  { role: 'admin', path: '/hotel/employees', name: 'employees' },
  { role: 'admin', path: '/hotel/audit', name: 'change log' },
  { role: 'staff', path: '/hotel/queue', name: 'my rounds' },
  {
    role: 'staff',
    path: '/hotel/queue',
    name: 'care round',
    open: (page) => page.getByRole('list', { name: 'My rounds' }).getByRole('listitem').first().getByRole('link').click(),
  },
];

for (const colorScheme of ['light', 'dark'] as const) {
test.describe(`accessibility (axe, ${colorScheme})`, () => {
  test.use({ colorScheme });
  for (const { role, path, name, open } of PAGES) {
    test(`${name} has no serious or critical violations`, async ({ page }) => {
      if (role) await signIn(page, role, path);
      else await page.goto(path);
      await page.waitForFunction(() => !document.querySelector('.loading'));
      await open?.(page);
      await page.waitForTimeout(200);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const serious = violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
      expect(serious, serious.join('\n')).toEqual([]);
    });
  }
});
}
