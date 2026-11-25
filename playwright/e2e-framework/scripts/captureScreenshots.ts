/**
 * Captures the same UI states in every UI version and writes a side-by-side comparison page.
 *
 *   npm run serve --workspace server-in-test        # in one terminal (port 3000)
 *   npm run screenshots --workspace e2e-framework   # in another (BASE_URL to override)
 *
 * Output: docs/ui-versions.md + docs/screenshots/*.png at the repository root.
 */
import { chromium, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const DOCS_DIR = resolve(import.meta.dirname, '../../../docs');
const SHOTS_DIR = join(DOCS_DIR, 'screenshots');
const VERSIONS = [1, 2, 3] as const;

interface Shot {
  app: string;
  state: string;
  description: string;
  path: string;
  /** Brings the page into the state to capture (after navigation). */
  prepare?: (page: Page) => Promise<void>;
}

const signIn = async (page: Page, password: string) => {
  await page.getByRole('textbox', { name: /username/i }).fill('admin');
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /log in|sign in|continue/i }).click();
};

const openFirstRowActions = (page: Page) =>
  page.getByRole('button', { name: /row actions|more options|more actions/i }).first().click();

const SHOTS: Shot[] = [
  { app: 'login', state: 'form', description: 'Empty sign-in form', path: '/login/' },
  {
    app: 'login', state: 'error', description: 'Invalid credentials', path: '/login/',
    prepare: async (page) => {
      await signIn(page, 'wrong');
      await page.getByRole('alert').waitFor();
    },
  },
  {
    app: 'login', state: 'signed-in', description: 'After a successful sign-in', path: '/login/',
    prepare: async (page) => {
      await signIn(page, 'password123');
      await page.getByRole('status').waitFor();
    },
  },
  { app: 'query', state: 'list', description: 'Results list with filters', path: '/query/' },
  {
    app: 'query', state: 'row-actions', description: 'Row "…" actions opened (menu, popover or drawer)', path: '/query/',
    prepare: async (page) => {
      await openFirstRowActions(page);
      await page.getByRole('button', { name: /^(edit|edit record)$/i }).waitFor();
    },
  },
  {
    app: 'query', state: 'edit', description: 'Editing a record', path: '/query/',
    prepare: async (page) => {
      await openFirstRowActions(page);
      await page.getByRole('button', { name: /^(edit|edit record)$/i }).click();
      await page.getByRole('button', { name: /^save/i }).waitFor();
    },
  },
  {
    app: 'query', state: 'details', description: 'Viewing record details', path: '/query/',
    prepare: async (page) => {
      await openFirstRowActions(page);
      await page.getByRole('button', { name: /^(view|view details)$/i }).click();
    },
  },
  { app: 'report', state: 'summary', description: 'Report summary', path: '/report/' },
];

const fileName = (shot: Shot, version: number) => `${shot.app}-${shot.state}-v${version}.png`;

async function capture(page: Page) {
  const request = page.context().request;
  for (const version of VERSIONS) {
    await request.put(`${BASE_URL}/api/ui-version`, { data: { version } });
    for (const shot of SHOTS) {
      await request.post(`${BASE_URL}/api/test/reset`);
      await page.goto(`${BASE_URL}${shot.path}`);
      await page.locator(`[data-ui-version="${version}"]`).waitFor();
      await shot.prepare?.(page);
      await page.waitForTimeout(150); // let transitions and fonts settle
      await page.screenshot({ path: join(SHOTS_DIR, fileName(shot, version)) });
      console.log(`captured ${fileName(shot, version)}`);
    }
  }
  await request.put(`${BASE_URL}/api/ui-version`, { data: { version: 1 } });
}

function markdown(): string {
  const sections = ['login', 'query', 'report'].map((app) => {
    const title = { login: 'Login', query: 'Query (results table)', report: 'Report' }[app];
    const rows = SHOTS.filter((s) => s.app === app).map((shot) => {
      const cells = VERSIONS.map((v) => {
        const src = `screenshots/${fileName(shot, v)}`;
        return `<a href="${src}"><img src="${src}" alt="${app} ${shot.state} v${v}" width="100%"></a>`;
      });
      return `| **${shot.description}** | ${cells.join(' | ')} |`;
    });
    return [`## ${title}`, '', '| State | v1 | v2 | v3 |', '| --- | --- | --- | --- |', ...rows].join('\n');
  });

  return [
    '# UI versions side by side',
    '',
    'The same states captured in each UI version of the sample apps (1280×800, Chromium). Click an image to open it at full size.',
    'Page objects target **v1** only. **v2** and **v3** are what the self-healing locators have to cope with.',
    '',
    'Regenerate with `npm run screenshots --workspace e2e-framework` while the sample server is running.',
    '',
    ...sections.flatMap((s) => [s, '']),
  ].join('\n');
}

await mkdir(SHOTS_DIR, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await capture(page);
} finally {
  await browser.close();
}
await writeFile(join(DOCS_DIR, 'ui-versions.md'), markdown());
console.log(`wrote ${join(DOCS_DIR, 'ui-versions.md')}`);
