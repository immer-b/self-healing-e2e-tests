import { test, expect, type Page } from '@playwright/test';
import { createHealer, type HealEvent, type HealerOptions } from '../../src/healing/healer';
import { createMemoryStore } from '../../src/store/memoryStore';
import type { ElementStore } from '../../src/store/types';

const LOGIN_V1 = `
  <main><h1>Sign in</h1>
    <form id="login-form">
      <label for="username">Username</label><input id="username" name="username">
      <label for="password">Password</label><input id="password" name="password" type="password">
      <button id="login-button" type="submit">Log in</button>
    </form>
  </main>`;

const LOGIN_V2 = `
  <div class="card"><h2>Welcome back</h2>
    <form class="auth-form">
      <div class="field"><input class="input-user" name="user" placeholder="Username"></div>
      <div class="field"><input class="input-pass" name="pass" type="password" placeholder="Password"></div>
      <a href="#forgot">Forgot password?</a>
      <button class="btn btn-primary" type="submit">Sign in</button>
    </form>
  </div>`;

const TABLE_V1 = `
  <table id="results"><tbody>
    <tr data-id="1"><td>Alpha</td><td>alice</td><td><button class="row-menu" aria-label="Row actions">⋯</button></td></tr>
    <tr data-id="2"><td>Beta</td><td>bob</td><td><button class="row-menu" aria-label="Row actions">⋯</button></td></tr>
    <tr data-id="3"><td>Gamma</td><td>carol</td><td><button class="row-menu" aria-label="Row actions">⋯</button></td></tr>
  </tbody></table>`;

const CARDS_V3 = `
  <h1>Explorer</h1>
  <ul class="card-list">
    <li class="result-card"><h3>Alpha</h3><p>Owner: alice</p><button class="card-more" aria-label="More actions">⋮</button></li>
    <li class="result-card"><h3>Beta</h3><p>Owner: bob</p><button class="card-more" aria-label="More actions">⋮</button></li>
    <li class="result-card"><h3>Gamma</h3><p>Owner: carol</p><button class="card-more" aria-label="More actions">⋮</button></li>
  </ul>
  <button class="fab" aria-label="Create record">+</button>`;

const METRICS_V1 = `
  <div class="metric-card" id="metric-total"><span class="label">Total records</span><span class="value">6</span></div>
  <div class="metric-card" id="metric-pending"><span class="label">Pending</span><span class="value">2</span></div>`;

const METRICS_V2 = `
  <dl><dt>Pending</dt><dd>2</dd><dt>Records</dt><dd>6</dd><dt>Total value</dt><dd>$7,800</dd></dl>`;

let store: ElementStore;
let events: HealEvent[];

const healerFor = (page: Page, options: Partial<HealerOptions> = {}) =>
  createHealer({ store, primaryTimeout: 300, healTimeout: 1500, onHeal: (e) => events.push(e), ...options }).forPage(page, 'login');

test.beforeEach(() => {
  store = createMemoryStore();
  events = [];
});

test.describe('baseline capture', () => {
  test('records a fingerprint when the primary selector matches', async ({ page }) => {
    await page.setContent(LOGIN_V1);
    const username = await healerFor(page).locate({ key: 'username', selector: '#username' });
    await username.fill('admin');

    const record = await store.get('login', 'username');
    expect(record?.selector).toBe('#username');
    expect(record?.fingerprint).toMatchObject({ tag: 'input', role: 'textbox', id: 'username', accessibleName: 'Username' });
    expect(record?.fingerprint.attributes.type).toBe('text');
    expect(record?.fingerprint.path[0]).toBe('form');
    expect(events).toEqual([]);
  });
});

test.describe('healing', () => {
  test('heals inputs and buttons whose ids and classes changed', async ({ page }) => {
    await page.setContent(LOGIN_V1);
    const v1 = healerFor(page);
    for (const [key, selector] of [['username', '#username'], ['password', '#password'], ['submit', '#login-button']]) {
      await v1.locate({ key, selector });
    }

    await page.setContent(LOGIN_V2);
    const v2 = healerFor(page);
    await (await v2.locate({ key: 'username', selector: '#username' })).fill('admin');
    await (await v2.locate({ key: 'password', selector: '#password' })).fill('secret');
    const submit = await v2.locate({ key: 'submit', selector: '#login-button' });

    await expect(page.locator('.input-user')).toHaveValue('admin');
    await expect(page.locator('.input-pass')).toHaveValue('secret');
    await expect(submit).toHaveText('Sign in');
    expect(events.map((e) => e.elementKey)).toEqual(['username', 'password', 'submit']);
    expect(events[0]).toMatchObject({ pageId: 'login', originalSelector: '#username' });
    expect(events[0].score).toBeGreaterThan(0.5);
  });

  test('keeps the baseline fingerprint unless updateBaselineOnHeal is enabled', async ({ page }) => {
    await page.setContent(LOGIN_V1);
    await healerFor(page).locate({ key: 'password', selector: '#password' });
    await page.setContent(LOGIN_V2);
    await healerFor(page).locate({ key: 'password', selector: '#password' });
    expect((await store.get('login', 'password'))?.fingerprint.id).toBe('password');

    await healerFor(page, { updateBaselineOnHeal: true }).locate({ key: 'password', selector: '#password' });
    expect((await store.get('login', 'password'))?.fingerprint.classes).toEqual(['input-pass']);
  });

  test('reuses a healed selector for the same page and reports it as a cache hit', async ({ page }) => {
    await page.setContent(LOGIN_V1);
    await healerFor(page).locate({ key: 'username', selector: '#username' });
    await page.setContent(LOGIN_V2);
    const healer = healerFor(page);
    await healer.locate({ key: 'username', selector: '#username' });
    await healer.locate({ key: 'username', selector: '#username' });
    expect(events.map((e) => e.fromCache)).toEqual([false, true]);
  });

  test('waits for an element that renders late while healing', async ({ page }) => {
    await page.setContent(LOGIN_V1);
    await healerFor(page).locate({ key: 'submit', selector: '#login-button' });
    await page.setContent(`<div id="app"></div><script>
      setTimeout(() => { document.getElementById('app').innerHTML = '<form><button type="submit" class="go">Sign in</button></form>'; }, 500);
    </script>`);
    const submit = await healerFor(page).locate({ key: 'submit', selector: '#login-button' });
    await expect(submit).toHaveClass('go');
  });

  test('fails with a helpful message when there is no baseline', async ({ page }) => {
    await page.setContent(LOGIN_V2);
    await expect(healerFor(page).locate({ key: 'username', selector: '#username' })).rejects.toThrow(
      /login\.username.*#username.*no baseline/i,
    );
  });

  test('fails when no candidate is similar enough', async ({ page }) => {
    await page.setContent(LOGIN_V1);
    await healerFor(page).locate({ key: 'password', selector: '#password' });
    await page.setContent('<p>Maintenance in progress</p>');
    await expect(healerFor(page).locate({ key: 'password', selector: '#password' })).rejects.toThrow(/could not heal/i);
  });
});

test.describe('collections and scopes', () => {
  test('heals a collection of rows into the matching list items', async ({ page }) => {
    await page.setContent(TABLE_V1);
    const v1Rows = await healerFor(page).locateAll({ key: 'rows', selector: '#results tbody tr' });
    await expect(v1Rows).toHaveCount(3);

    await page.setContent(CARDS_V3);
    const rows = await healerFor(page).locateAll({ key: 'rows', selector: '#results tbody tr' });
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: 'Beta' })).toContainText('bob');
  });

  test('excludes same-tag siblings with extra classes (e.g. a header row) from a healed collection', async ({ page }) => {
    await page.setContent(TABLE_V1);
    await healerFor(page).locateAll({ key: 'rows', selector: '#results tbody tr' });
    await page.setContent(`
      <div role="grid" class="data-grid">
        <div role="row" class="grid-row grid-header"><span>Name</span><span>Owner</span><span></span></div>
        <div role="row" class="grid-row"><span>Alpha</span><span>alice</span><span><button class="kebab" aria-label="More options">…</button></span></div>
        <div role="row" class="grid-row"><span>Beta</span><span>bob</span><span><button class="kebab" aria-label="More options">…</button></span></div>
      </div>`);
    const rows = await healerFor(page).locateAll({ key: 'rows', selector: '#results tbody tr' });
    await expect(rows).toHaveCount(2);
  });

  test('heals an element inside a scope such as a single row', async ({ page }) => {
    await page.setContent(TABLE_V1);
    const healer = healerFor(page);
    const v1Row = (await healer.locateAll({ key: 'rows', selector: '#results tbody tr' })).filter({ hasText: 'Alpha' });
    await healer.locate({ key: 'rowActions', selector: 'button.row-menu', scope: v1Row });

    await page.setContent(CARDS_V3);
    const v3 = healerFor(page);
    const row = (await v3.locateAll({ key: 'rows', selector: '#results tbody tr' })).filter({ hasText: 'Gamma' });
    const actions = await v3.locate({ key: 'rowActions', selector: 'button.row-menu', scope: row });
    await expect(actions).toHaveAttribute('aria-label', 'More actions');
    await expect(actions).toHaveCount(1);
    expect(await actions.evaluate((el) => el.closest('li')?.textContent)).toContain('Gamma');
  });

  test('heals a value element using its surrounding label context', async ({ page }) => {
    await page.setContent(METRICS_V1);
    await healerFor(page).locate({ key: 'totalRecords', selector: '#metric-total .value', dynamicText: true });
    await page.setContent(METRICS_V2);
    const total = await healerFor(page).locate({ key: 'totalRecords', selector: '#metric-total .value', dynamicText: true });
    await expect(total).toHaveText('6');
  });
});
