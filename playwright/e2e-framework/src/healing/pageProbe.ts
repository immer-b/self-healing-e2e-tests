import type { Locator } from '@playwright/test';
import { browserScript, type BrowserRequest, type BrowserResponse } from '../fingerprint/browserScript';

/** Typed wrappers around the in-page `browserScript`. */

const run = <R extends BrowserRequest>(target: Locator, request: R) =>
  target.evaluate(browserScript, request) as Promise<BrowserResponse<R>>;

export const fingerprintOf = (element: Locator) => run(element.first(), { mode: 'fingerprint' });

export const candidatesIn = (root: Locator, maxCandidates: number) => run(root, { mode: 'candidates', maxCandidates });

export const groupSelectorFor = (root: Locator, selector: string) => run(root, { mode: 'groupSelector', selector });

/** Waits up to `timeout` ms for the locator to match. Playwright treats timeout 0 as "no limit", hence the floor. */
export const appears = (locator: Locator, timeout: number) =>
  locator
    .first()
    .waitFor({ state: 'attached', timeout: Math.max(1, timeout) })
    .then(() => true, () => false);
