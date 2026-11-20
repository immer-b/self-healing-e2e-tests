import type { Locator, Page } from '@playwright/test';
import type { Candidate, ElementFingerprint } from '../fingerprint/types';
import { candidatesIn } from './pageProbe';
import { pickBest, rankCandidates, type PickOptions, type Ranked, type ScoreOptions } from './scoring';

const RESCAN_INTERVAL_MS = 200;
const REPORTED_CANDIDATES = 3;

export interface SearchRequest {
  page: Page;
  root: Locator;
  baseline: ElementFingerprint;
  scoreOptions: ScoreOptions;
  pickOptions: PickOptions;
  maxCandidates: number;
  timeout: number;
}

export type SearchResult =
  | { found: true; best: Ranked<Candidate> }
  | { found: false; topCandidates: Ranked<Candidate>[] };

/**
 * Repeatedly scans `root` for the candidate most similar to `baseline` until one is accepted or the
 * timeout elapses (the element may still be rendering).
 */
export async function searchForCandidate(request: SearchRequest): Promise<SearchResult> {
  const { page, root, baseline, scoreOptions, pickOptions, maxCandidates, timeout } = request;
  const deadline = Date.now() + timeout;
  let topCandidates: Ranked<Candidate>[] = [];

  do {
    const ranked = rankCandidates(baseline, await candidatesIn(root, maxCandidates), scoreOptions);
    const best = pickBest(ranked, pickOptions);
    if (best) return { found: true, best };
    if (ranked.length) topCandidates = ranked.slice(0, REPORTED_CANDIDATES);
    await page.waitForTimeout(RESCAN_INTERVAL_MS);
  } while (Date.now() < deadline);

  return { found: false, topCandidates };
}

/** Sibling items share a selector up to their final `:nth-of-type(n)`. */
export const siblingGroup = (selector: string) => selector.replace(/:nth-of-type\(\d+\)$/, '');
