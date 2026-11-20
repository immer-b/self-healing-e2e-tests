import type { Locator, Page } from '@playwright/test';
import type { ElementFingerprint } from '../fingerprint/types';
import { createBaselines } from './baselines';
import { searchForCandidate, siblingGroup } from './candidateSearch';
import { healFailedError } from './errors';
import { appears, fingerprintOf, groupSelectorFor } from './pageProbe';
import { rankCandidates, type ScoreResult } from './scoring';
import { DEFAULT_SETTINGS, type HealerOptions, type HealerSettings, type LocateSpec } from './types';

export type { HealerOptions, HealEvent, LocateSpec } from './types';

/**
 * Resolution order for every lookup:
 *   1. primary selector matches  -> record/refresh the baseline fingerprint, use it;
 *   2. a healed selector is cached for this page URL and still looks right -> reuse it;
 *   3. otherwise scan the page and pick the element most similar to the stored baseline.
 *
 * Healed selectors are cached per healer, so share one healer per worker and call `forPage`
 * from each page object.
 */
export function createHealer(options: HealerOptions) {
  const settings: HealerSettings = { ...DEFAULT_SETTINGS, ...withoutUndefined(options), store: options.store };
  const baselines = createBaselines(settings.store);
  const healedSelectors = new Map<string, string>();

  function forPage(page: Page, pageId: string) {
    const rootOf = (spec: LocateSpec) => spec.scope?.first() ?? page.locator(':root');
    const within = (spec: LocateSpec, selector: string) => (spec.scope ?? page).locator(selector);
    const cacheKey = (spec: LocateSpec, collection: boolean) => {
      const { pathname, search } = new URL(page.url());
      return [pageId, spec.key, spec.selector, collection, pathname, search].join('|');
    };
    const shape = (locator: Locator, collection: boolean) => (collection ? locator : locator.first());

    const report = (spec: LocateSpec, healedSelector: string, result: ScoreResult, fromCache: boolean) =>
      settings.onHeal?.({
        pageId,
        elementKey: spec.key,
        originalSelector: spec.selector,
        healedSelector,
        score: Number(result.score.toFixed(3)),
        breakdown: result.breakdown,
        url: page.url(),
        fromCache,
      });

    /** A cached healed selector is reused only while it still points at a similar element. */
    async function reuseCachedSelector(spec: LocateSpec, collection: boolean, baseline: ElementFingerprint) {
      const cached = healedSelectors.get(cacheKey(spec, collection));
      if (!cached) return undefined;
      const locator = within(spec, cached);
      if (!(await appears(locator, settings.primaryTimeout))) return undefined;
      const [match] = rankCandidates(baseline, [{ fingerprint: await fingerprintOf(locator) }], spec);
      if (match.score < settings.minScore) return undefined;
      report(spec, cached, match, true);
      return locator;
    }

    async function heal(spec: LocateSpec, collection: boolean): Promise<Locator> {
      const { fingerprint: baseline } = await baselines.load(pageId, spec);

      const reused = await reuseCachedSelector(spec, collection, baseline);
      if (reused) return shape(reused, collection);

      const result = await searchForCandidate({
        page,
        root: rootOf(spec),
        baseline,
        scoreOptions: spec,
        pickOptions: { ...settings, groupOf: collection ? siblingGroup : undefined },
        maxCandidates: settings.maxCandidates,
        timeout: settings.healTimeout,
      });
      if (!result.found) throw healFailedError(pageId, spec, settings.threshold, result.topCandidates);

      const { best } = result;
      const healedSelector = collection ? await groupSelectorFor(rootOf(spec), best.selector) : best.selector;
      healedSelectors.set(cacheKey(spec, collection), healedSelector);
      if (settings.updateBaselineOnHeal) await baselines.save(pageId, spec, best.fingerprint);
      report(spec, healedSelector, best, false);
      return shape(within(spec, healedSelector), collection);
    }

    async function resolve(spec: LocateSpec, collection: boolean): Promise<Locator> {
      const primary = within(spec, spec.selector);
      const knownBroken = healedSelectors.has(cacheKey(spec, collection));
      if (!knownBroken && (await appears(primary, settings.primaryTimeout))) {
        await baselines.save(pageId, spec, await fingerprintOf(primary));
        return shape(primary, collection);
      }
      if ((await primary.count()) > 0) return shape(primary, collection);
      return heal(spec, collection);
    }

    return {
      /** Resolves a single element, healing the selector if it no longer matches. */
      locate: (spec: LocateSpec) => resolve(spec, false),
      /** Resolves a collection (e.g. table rows); heals to the best match plus its similar siblings. */
      locateAll: (spec: LocateSpec) => resolve({ ignoreContent: true, ...spec }, true),
    };
  }

  return { forPage };
}

export type Healer = ReturnType<typeof createHealer>;
export type PageHealer = ReturnType<Healer['forPage']>;

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
