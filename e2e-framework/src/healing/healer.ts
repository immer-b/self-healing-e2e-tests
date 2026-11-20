import type { Locator, Page } from '@playwright/test';
import { browserScript, type BrowserRequest, type BrowserResponse } from '../fingerprint/browserScript';
import type { ElementFingerprint, ElementRecord } from '../fingerprint/types';
import type { ElementStore } from '../store/types';
import { pickBest, rankCandidates, type ScoreResult } from './scoring';

export interface HealerOptions {
  store: ElementStore;
  /** Similarity score (0..1) at which a candidate is always accepted. */
  threshold?: number;
  /** Lowest score accepted when the winner leads the runner-up by at least `minMargin`. */
  minScore?: number;
  minMargin?: number;
  /** How long to wait for the primary selector before trying to heal (ms). */
  primaryTimeout?: number;
  /** How long to keep re-scanning the page for a healing candidate (ms). */
  healTimeout?: number;
  /** Replace the stored fingerprint with the healed element's (learn the new UI). Default false. */
  updateBaselineOnHeal?: boolean;
  /** Maximum number of elements fingerprinted per scan. */
  maxCandidates?: number;
  onHeal?: (event: HealEvent) => void;
}

export interface LocateSpec {
  /** Stable logical name of the element within the page, e.g. "username" or "row.actions". */
  key: string;
  /** The selector written by the test author (works on the baseline UI). */
  selector: string;
  /** Restrict lookup and healing to this container (e.g. a single table row). */
  scope?: Locator;
  /** The element's text changes between runs (values, row contents): rely less on text. */
  dynamicText?: boolean;
}

export interface HealEvent {
  pageId: string;
  elementKey: string;
  originalSelector: string;
  healedSelector: string;
  score: number;
  breakdown: ScoreResult['breakdown'];
  url: string;
  /** True when a previously healed selector was reused instead of re-scanning the page. */
  fromCache: boolean;
}

const DEFAULTS = { threshold: 0.6, minScore: 0.45, minMargin: 0.1, primaryTimeout: 1500, healTimeout: 3000, maxCandidates: 3000 };
const RESCAN_INTERVAL_MS = 200;

const evaluate = <R extends BrowserRequest>(locator: Locator, request: R) =>
  locator.evaluate(browserScript, request) as Promise<BrowserResponse<R>>;

/** Waits up to `timeout` ms for the locator to match. Note: Playwright treats timeout 0 as "no limit". */
const appears = (locator: Locator, timeout: number) =>
  locator.first().waitFor({ state: 'attached', timeout: Math.max(1, timeout) }).then(() => true, () => false);

/**
 * Creates a healer. Healed selectors are cached per healer instance and URL, so create one healer per
 * worker/test and call `forPage` for each page object.
 */
export function createHealer(options: HealerOptions) {
  const { store, onHeal, updateBaselineOnHeal = false } = options;
  const { threshold, minScore, minMargin, primaryTimeout, healTimeout, maxCandidates } = { ...DEFAULTS, ...stripUndefined(options) };
  const healedSelectors = new Map<string, string>();
  const lastSaved = new Map<string, string>();

  function forPage(page: Page, pageId: string) {
    const rootOf = (spec: LocateSpec) => spec.scope?.first() ?? page.locator(':root');
    const within = (spec: LocateSpec, selector: string) => (spec.scope ?? page).locator(selector);
    const cacheKey = (spec: LocateSpec, collection: boolean) =>
      [pageId, spec.key, spec.selector, collection, new URL(page.url()).pathname, new URL(page.url()).search].join('|');

    async function saveBaseline(spec: LocateSpec, fingerprint: ElementFingerprint) {
      const serialised = JSON.stringify(fingerprint);
      const memoKey = `${pageId}|${spec.key}`;
      if (lastSaved.get(memoKey) === serialised) return;
      const record: ElementRecord = {
        pageId,
        elementKey: spec.key,
        selector: spec.selector,
        fingerprint,
        updatedAt: new Date().toISOString(),
      };
      await store.put(record);
      lastSaved.set(memoKey, serialised);
    }

    async function loadBaseline(spec: LocateSpec) {
      const record = await store.get(pageId, spec.key);
      if (!record) {
        throw new Error(
          `[self-healing] ${pageId}.${spec.key}: selector "${spec.selector}" matched nothing and there is no baseline ` +
            `fingerprint to heal from. Run the test once against a known-good UI to record one.`,
        );
      }
      return record;
    }

    function report(spec: LocateSpec, healedSelector: string, result: ScoreResult, fromCache: boolean) {
      onHeal?.({
        pageId,
        elementKey: spec.key,
        originalSelector: spec.selector,
        healedSelector,
        score: Number(result.score.toFixed(3)),
        breakdown: result.breakdown,
        url: page.url(),
        fromCache,
      });
    }

    /** A cached healed selector is reused only if it still points at a similar element. */
    async function reuseCached(spec: LocateSpec, selector: string, baseline: ElementFingerprint) {
      const locator = within(spec, selector);
      if (!(await appears(locator, primaryTimeout))) return undefined;
      const [match] = rankCandidates(baseline, [{ fingerprint: await evaluate(locator.first(), { mode: 'fingerprint' }) }], spec);
      if (match.score < minScore) return undefined;
      report(spec, selector, match, true);
      return locator;
    }

    async function heal(spec: LocateSpec, collection: boolean): Promise<Locator> {
      const baseline = await loadBaseline(spec);
      const key = cacheKey(spec, collection);
      const cached = healedSelectors.get(key);
      if (cached) {
        const reused = await reuseCached(spec, cached, baseline.fingerprint);
        if (reused) return collection ? reused : reused.first();
      }

      const deadline = Date.now() + healTimeout;
      let topSeen: { selector: string; score: number; breakdown: ScoreResult['breakdown'] }[] = [];
      do {
        const candidates = await evaluate(rootOf(spec), { mode: 'candidates', maxCandidates });
        const ranked = rankCandidates(baseline.fingerprint, candidates, spec);
        if (ranked.length) topSeen = ranked.slice(0, 3);
        const best = pickBest(ranked, { threshold, minScore, minMargin, groupOf: collection ? siblingGroup : undefined });
        if (best) {
          const healedSelector = collection
            ? await evaluate(rootOf(spec), { mode: 'groupSelector', selector: best.selector })
            : best.selector;
          healedSelectors.set(key, healedSelector);
          if (updateBaselineOnHeal) await saveBaseline(spec, best.fingerprint);
          report(spec, healedSelector, best, false);
          const locator = within(spec, healedSelector);
          return collection ? locator : locator.first();
        }
        await page.waitForTimeout(RESCAN_INTERVAL_MS);
      } while (Date.now() < deadline);

      throw new Error(
        `[self-healing] ${pageId}.${spec.key}: could not heal selector "${spec.selector}". ` +
          (topSeen.length
            ? `No candidate reached the threshold ${threshold}. Top candidates:\n` +
              topSeen.map((c) => `  ${c.score.toFixed(3)} ${c.selector} ${JSON.stringify(roundBreakdown(c.breakdown))}`).join('\n')
            : 'No candidates found.'),
      );
    }

    async function resolve(spec: LocateSpec, collection: boolean): Promise<Locator> {
      const primary = within(spec, spec.selector);
      if (!healedSelectors.has(cacheKey(spec, collection)) && (await appears(primary, primaryTimeout))) {
        await saveBaseline(spec, await evaluate(primary.first(), { mode: 'fingerprint' }));
        return collection ? primary : primary.first();
      }
      if ((await primary.count()) > 0) return collection ? primary : primary.first();
      return heal(spec, collection);
    }

    return {
      /** Resolves a single element, healing the selector if it no longer matches. */
      locate: (spec: LocateSpec) => resolve(spec, false),
      /** Resolves a collection (e.g. table rows); heals to the best match plus its similar siblings. */
      locateAll: (spec: LocateSpec) => resolve({ dynamicText: true, ...spec }, true),
    };
  }

  return { forPage };
}

export type Healer = ReturnType<typeof createHealer>;
export type PageHealer = ReturnType<Healer['forPage']>;

/** Sibling items share a selector up to their final `:nth-of-type(n)`. */
const siblingGroup = (selector: string) => selector.replace(/:nth-of-type\(\d+\)$/, '');

const roundBreakdown = (breakdown: ScoreResult['breakdown']) =>
  Object.fromEntries(Object.entries(breakdown).map(([k, v]) => [k, Number((v ?? 0).toFixed(2))]));

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
