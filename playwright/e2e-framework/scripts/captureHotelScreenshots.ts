/**
 * Captures the pet hotel staff app for the docs.
 *
 *   npm run serve --workspace server-in-test               # in one terminal (port 3000)
 *   npm run screenshots:hotel --workspace e2e-framework    # in another (BASE_URL to override)
 *
 * Output: docs/hotel.md + docs/screenshots/hotel-*.png at the repository root.
 * The server's clock is pinned to 2026-11-20 while capturing and released afterwards.
 */
import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const DOCS_DIR = resolve(import.meta.dirname, '../../../docs');
const SHOTS_DIR = join(DOCS_DIR, 'screenshots');
const TODAY = '2026-11-20';

const ACCOUNTS = {
  admin: ['admin', 'password123'],
  receiving: ['frontdesk', 'frontdesk123'],
  staff: ['jordan', 'staff123'],
} as const;
type Role = keyof typeof ACCOUNTS;

interface Shot {
  name: string;
  title: string;
  description: string;
  role?: Role;
  path: string;
  mobile?: boolean;
  /** Capture only the viewport instead of the whole scrollable page. */
  viewportOnly?: boolean;
  dark?: boolean;
  /** Runtime UI version for the staff rounds pages (1 when omitted). */
  uiVersion?: 1 | 2 | 3;
  prepare?: (page: Page) => Promise<void>;
}

const SHOTS: Shot[] = [
  { name: 'login', title: 'Sign in', description: 'One sign-in for every role. Sessions are HttpOnly cookies.', path: '/hotel/' },
  {
    name: 'today', title: 'Front desk: Today', role: 'receiving', path: '/hotel/today',
    description: "Arrivals and departures for the day with one-click check-in and check-out, plus the day's numbers.",
  },
  {
    name: 'schedule', title: 'Front desk: Care schedule', role: 'receiving', path: '/hotel/schedule',
    description: 'Morning and evening rounds shared evenly across the staff on shift. Reassign any round or rebalance the open ones.',
  },
  { name: 'pets', title: 'Front desk: Pets', role: 'receiving', path: '/hotel/pets', description: 'Search by pet, breed or owner. Archived pets stay on file.' },
  {
    name: 'pet-record', title: 'Front desk: Pet record', role: 'receiving', path: '/hotel/pets/pet-1',
    description: 'Special instructions, stays, the permanent notes log, owner details and every contact with their phone numbers.',
  },
  {
    name: 'owner-form', title: 'Front desk: New owner', role: 'receiving', path: '/hotel/owners',
    description: 'Any number of contacts, each with a relationship to the pet and any number of phone numbers.',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'New owner' }).click();
      const form = page.getByRole('dialog');
      await form.getByLabel('Owner name').fill('Nadia Okafor');
      await form.getByLabel('Email').fill('nadia@example.com');
      await form.getByLabel('Street address').fill('5 Pine St');
      await form.getByLabel('City').fill('Portland');
      await form.getByLabel('State').fill('OR');
      await form.getByLabel('ZIP code').fill('97201');
      const first = form.getByRole('group', { name: 'Contact 1' });
      await first.getByLabel('Contact name').fill('Nadia Okafor');
      await first.getByLabel('Relationship to pet').fill('Owner');
      await first.getByLabel('Phone number').fill('(503) 555-0188');
      await form.getByRole('button', { name: 'Add contact' }).click();
      const second = form.getByRole('group', { name: 'Contact 2' });
      await second.getByLabel('Contact name').fill('Tomi Okafor');
      await second.getByLabel('Relationship to pet').fill('Brother');
      await second.getByLabel('Phone number').fill('(503) 555-0189');
      await second.getByRole('button', { name: 'Add phone' }).click();
      await second.getByLabel('Phone number').nth(1).fill('(503) 555-0190');
      await second.getByLabel('Phone type').nth(1).selectOption('Work');
    },
  },
  { name: 'rooms', title: 'Rooms', role: 'admin', path: '/hotel/rooms', description: 'Occupancy by room type for any night. Admins add, edit and archive rooms.' },
  {
    name: 'employees', title: 'Admin: Employees', role: 'admin', path: '/hotel/employees',
    description: 'Accounts with a role (admin, front desk, general staff) and a job type. Archive instead of delete.',
  },
  {
    name: 'change-log', title: 'Admin: Change log', role: 'admin', path: '/hotel/audit', viewportOnly: true,
    description: 'Who changed what and when, field by field, for every entity.',
    prepare: async (page) => {
      await page.request.put(`${BASE_URL}/api/hotel/pets/pet-1`, { data: { breed: 'Beagle mix' } });
      await page.getByRole('button', { name: 'Refresh' }).click();
      await page.getByText('Beagle mix').first().waitFor();
    },
  },
  { name: 'queue', title: 'General staff: My rounds', role: 'staff', path: '/hotel/queue', description: "Today's rounds, pending first, with instructions flagged." },
  {
    name: 'round', title: 'General staff: Care round', role: 'staff', path: '/hotel/queue', viewportOnly: true,
    description: 'Checklist, special instructions, a room photo, notes and emergency contacts. Complete unlocks when everything is done.',
    prepare: openRoundAndFill,
  },
  {
    name: 'round-mobile', title: 'General staff: Care round on a phone', role: 'staff', path: '/hotel/queue', mobile: true,
    description: 'The same page on a 390 px wide phone screen.',
    prepare: openRoundAndFill,
  },
  { name: 'queue-v2', title: 'Staff rounds, UI v2: queue', role: 'staff', path: '/hotel/queue', uiVersion: 2, description: 'A table layout. The self-healing tests reach it with page objects written for v1.' },
  { name: 'round-v2', title: 'Staff rounds, UI v2: round', role: 'staff', path: '/hotel/queue', uiVersion: 2, viewportOnly: true, description: 'One column with switches, the photo first and an inline finish button.', prepare: openRoundAndFill },
  { name: 'queue-v3', title: 'Staff rounds, UI v3: queue', role: 'staff', path: '/hotel/queue', uiVersion: 3, description: 'Cards with a counter.' },
  { name: 'round-v3', title: 'Staff rounds, UI v3: round', role: 'staff', path: '/hotel/queue', uiVersion: 3, viewportOnly: true, description: 'Numbered steps in working order, with a "Finish round" button.', prepare: openRoundAndFill },
  {
    name: 'today-dark', title: 'Front desk: Today in dark mode', role: 'receiving', path: '/hotel/today', dark: true, viewportOnly: true,
    description: 'The app follows the system theme, or the Light/Dark choice in the sidebar.',
  },
  {
    name: 'round-dark', title: 'General staff: Care round in dark mode', role: 'staff', path: '/hotel/queue', dark: true, viewportOnly: true,
    description: 'Dark mode on the page staff use most. Contrast is checked by the axe tests in both themes.',
    prepare: openRoundAndFill,
  },
];

async function openRoundAndFill(page: Page) {
  await page.locator('main a[href*="/hotel/queue/task-"]').first().click();
  // Works in every rounds layout (v1/v2/v3 label these controls differently).
  await page.getByRole('checkbox', { name: /clean/i }).check();
  await page.getByRole('checkbox', { name: /fed|feed/i }).check();
  await page.locator('input[type=file]').setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer: await samplePhoto(page) });
  await page.getByRole('img', { name: /in E-101/ }).waitFor();
}

/** Draws a stand-in "room photo" (warm room, bed, paw) in the browser so docs don't show a blank image. */
async function samplePhoto(page: Page): Promise<Buffer> {
  // Passed as a string: tsx would otherwise inject helpers that don't exist in the page.
  const dataUrl = await page.evaluate<string>(`(() => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 960, height: 540 });
    const ctx = canvas.getContext('2d');
    const wall = ctx.createLinearGradient(0, 0, 0, 540);
    wall.addColorStop(0, '#e9dcc8');
    wall.addColorStop(1, '#d6c3a5');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, 960, 540);
    ctx.fillStyle = '#b08d64';
    ctx.fillRect(0, 380, 960, 160);
    ctx.fillStyle = '#5b8f86';
    ctx.beginPath();
    ctx.ellipse(480, 420, 260, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5235';
    for (const [x, y, r] of [[480, 360, 46], [420, 290, 18], [460, 270, 18], [500, 270, 18], [540, 290, 18]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas.toDataURL('image/png');
  })()`);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function capture(browser: Browser, shot: Shot) {
  const context = await browser.newContext({
    viewport: shot.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: shot.mobile ? 2 : 1,
    colorScheme: shot.dark ? 'dark' : 'light',
  });
  const page = await context.newPage();
  await context.request.post(`${BASE_URL}/api/test/reset`);
  await context.request.put(`${BASE_URL}/api/ui-version`, { data: { version: shot.uiVersion ?? 1 } });
  await page.goto(`${BASE_URL}${shot.path}`);
  if (shot.role) {
    const [username, password] = ACCOUNTS[shot.role];
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: 'Sign out' }).waitFor();
  } else {
    await page.getByRole('heading', { name: 'Sign in' }).waitFor();
  }
  // Not 'networkidle': the live-updates stream (Server-Sent Events) keeps a request open.
  await page.waitForFunction(() => !document.querySelector('.loading'));
  await shot.prepare?.(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS_DIR, `hotel-${shot.name}.png`), fullPage: !shot.mobile && !shot.viewportOnly });
  console.log(`captured hotel-${shot.name}.png`);
  await context.close();
}

function markdown() {
  return [
    '# Pet hotel screens',
    '',
    `The Willow Pet Hotel staff app (\`/hotel/\`) on the seeded data, captured at 1440 px wide in Chromium with the server clock pinned to ${TODAY}. Click an image to open it at full size.`,
    '',
    'Regenerate with `npm run screenshots:hotel --workspace e2e-framework` while the sample server is running.',
    '',
    ...SHOTS.flatMap((shot) => [
      `## ${shot.title}`,
      '',
      shot.description,
      '',
      `<a href="screenshots/hotel-${shot.name}.png"><img src="screenshots/hotel-${shot.name}.png" alt="${shot.title}" width="${shot.mobile ? '320' : '100%'}"></a>`,
      '',
    ]),
  ].join('\n');
}

await mkdir(SHOTS_DIR, { recursive: true });
const browser = await chromium.launch();
const api = await browser.newContext();
try {
  await api.request.put(`${BASE_URL}/api/test/clock`, { data: { now: `${TODAY}T08:00:00` } });
  for (const shot of SHOTS) await capture(browser, shot);
} finally {
  await api.request.put(`${BASE_URL}/api/test/clock`, { data: { now: null } });
  await api.request.put(`${BASE_URL}/api/ui-version`, { data: { version: 1 } });
  await api.request.post(`${BASE_URL}/api/test/reset`);
  await browser.close();
}
await writeFile(join(DOCS_DIR, 'hotel.md'), markdown());
console.log(`wrote ${join(DOCS_DIR, 'hotel.md')}`);
