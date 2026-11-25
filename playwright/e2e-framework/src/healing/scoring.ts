import type { ElementFingerprint } from '../fingerprint/types';
import { FEATURES, type FeatureName } from './features';

export type FeatureWeights = Record<FeatureName, number>;

export const DEFAULT_WEIGHTS: FeatureWeights = {
  tag: 2,
  role: 2,
  type: 2,
  accessibleName: 3,
  text: 2,
  attributes: 1.5,
  context: 1.5,
  path: 0.5,
  structure: 0.5,
};

/**
 * For dynamic text only the value's format is compared, at this fraction of the normal text weight;
 * the remainder moves to context.
 */
const DYNAMIC_TEXT_FACTOR = 0.5;

export interface ScoreOptions {
  /** Own text changes between runs (metric values): rely on surrounding context instead. */
  dynamicText?: boolean;
  /** Text and surroundings are pure data (collection items such as rows): compare structure only. */
  ignoreContent?: boolean;
  weights?: Partial<FeatureWeights>;
}

export interface ScoreResult {
  score: number;
  breakdown: Partial<Record<FeatureName, number>>;
}

function effectiveWeights({ dynamicText, weights }: ScoreOptions): FeatureWeights {
  const result = { ...DEFAULT_WEIGHTS, ...weights };
  if (dynamicText) {
    // Text is unreliable, so the surrounding context (labels, captions) has to identify the element.
    result.context += result.text * (1 - DYNAMIC_TEXT_FACTOR);
    result.text *= DYNAMIC_TEXT_FACTOR;
  }
  return result;
}

/** Compares a baseline fingerprint against a candidate; `score` is the weighted mean of applicable features. */
export function scoreFingerprint(baseline: ElementFingerprint, candidate: ElementFingerprint, options: ScoreOptions = {}): ScoreResult {
  const weights = effectiveWeights(options);
  const ctx = { dynamicText: options.dynamicText ?? false, ignoreContent: options.ignoreContent ?? false };

  let total = 0;
  let weightSum = 0;
  const breakdown: ScoreResult['breakdown'] = {};
  for (const [name, feature] of Object.entries(FEATURES) as [FeatureName, (typeof FEATURES)[FeatureName]][]) {
    const value = feature(baseline, candidate, ctx);
    if (value === undefined) continue;
    breakdown[name] = value;
    total += value * weights[name];
    weightSum += weights[name];
  }
  return { score: weightSum ? total / weightSum : 0, breakdown };
}

export type Ranked<T> = T & ScoreResult;

export function rankCandidates<T extends { fingerprint: ElementFingerprint }>(
  baseline: ElementFingerprint,
  candidates: readonly T[],
  options?: ScoreOptions,
): Ranked<T>[] {
  return candidates
    .map((c) => ({ ...c, ...scoreFingerprint(baseline, c.fingerprint, options) }))
    .sort((a, b) => b.score - a.score);
}

export interface PickOptions {
  /** A candidate at or above this score is always accepted. */
  threshold: number;
  /** Lower bound for accepting a candidate that clearly dominates the runner-up. */
  minScore?: number;
  /** Required lead over the best candidate from a different group. */
  minMargin?: number;
  /** Maps a candidate selector to a group; same-group runners-up (e.g. sibling rows) are not competitors. */
  groupOf?: (selector: string) => string;
}

export function pickBest<T extends { score: number; selector?: string }>(
  ranked: readonly T[],
  { threshold, minScore = threshold, minMargin = 0, groupOf }: PickOptions,
): T | undefined {
  const [best] = ranked;
  if (!best) return undefined;
  if (best.score >= threshold) return best;
  if (best.score < minScore) return undefined;
  const bestGroup = groupOf?.(best.selector ?? '');
  const runnerUp = ranked.slice(1).find((c) => !groupOf || groupOf(c.selector ?? '') !== bestGroup);
  return !runnerUp || best.score - runnerUp.score >= minMargin ? best : undefined;
}
