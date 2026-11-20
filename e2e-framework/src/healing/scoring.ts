import type { ElementFingerprint } from '../fingerprint/types';
import { sequenceSimilarity, setSimilarity, textSimilarity, tokenize } from './similarity';

export interface FeatureWeights {
  tag: number;
  role: number;
  type: number;
  accessibleName: number;
  text: number;
  attributes: number;
  context: number;
  path: number;
  structure: number;
}

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

/** Text weight multiplier when the element's text is expected to change (row contents, metric values). */
const DYNAMIC_TEXT_FACTOR = 0.15;

export interface ScoreOptions {
  dynamicText?: boolean;
  weights?: Partial<FeatureWeights>;
}

export interface ScoreResult {
  score: number;
  breakdown: Partial<Record<keyof FeatureWeights, number>>;
}

const TAG_FAMILIES = [
  ['input', 'textarea', 'select'],
  ['button', 'a'],
  ['tr', 'li', 'article', 'div', 'section'],
  ['td', 'th', 'span', 'dd', 'div', 'p', 'strong'],
  ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  ['table', 'ul', 'ol', 'div', 'dl'],
];

const ROLE_FAMILIES = [
  ['textbox', 'searchbox', 'combobox'],
  ['button', 'link', 'menuitem', 'tab'],
  ['row', 'listitem', 'article', 'group'],
  ['cell', 'gridcell', 'rowheader', 'definition'],
  ['table', 'grid', 'list'],
  ['alert', 'status'],
  ['dialog', 'region', 'complementary'],
];

const familyMatch = (families: string[][], a: string, b: string) => {
  if (!a && !b) return 1;
  if (a === b) return 1;
  return families.some((f) => f.includes(a) && f.includes(b)) ? 0.5 : 0;
};

const ratio = (a: number, b: number) => 1 - Math.abs(a - b) / Math.max(a, b, 1);

/** Bag of identifier-ish tokens: id, classes and descriptive attributes. */
const attributeTokens = (f: ElementFingerprint) =>
  tokenize([f.id, ...f.classes, ...Object.entries(f.attributes).filter(([k]) => k !== 'type').map(([, v]) => v)].join(' '));

function contextSimilarity(a: ElementFingerprint['context'], b: ElementFingerprint['context']): number | undefined {
  const pairs: [string, string][] = [
    [a.label, b.label],
    [a.ancestorLabels.join(' '), b.ancestorLabels.join(' ')],
    [a.parentText, b.parentText],
  ];
  const present = pairs.filter(([x, y]) => x || y);
  if (!present.length) return undefined;
  // The baseline's label may now live in a different context slot, so also compare across slots.
  const aAll = pairs.map(([x]) => x).filter(Boolean);
  const bAll = pairs.map(([, y]) => y).filter(Boolean);
  const cross = Math.max(0, ...aAll.flatMap((x) => bAll.map((y) => textSimilarity(x, y))));
  const aligned = present.reduce((sum, [x, y]) => sum + textSimilarity(x, y), 0) / present.length;
  return Math.max(aligned, cross * 0.9);
}

/** Compares a baseline fingerprint against a candidate; `score` is a weighted mean in [0, 1]. */
export function scoreFingerprint(
  baseline: ElementFingerprint,
  candidate: ElementFingerprint,
  { dynamicText = false, weights: overrides }: ScoreOptions = {},
): ScoreResult {
  const weights = { ...DEFAULT_WEIGHTS, ...overrides };
  if (dynamicText) weights.text *= DYNAMIC_TEXT_FACTOR;

  const typeA = baseline.attributes.type ?? '';
  const typeB = candidate.attributes.type ?? '';

  const features: Partial<Record<keyof FeatureWeights, number | undefined>> = {
    tag: familyMatch(TAG_FAMILIES, baseline.tag, candidate.tag),
    role: familyMatch(ROLE_FAMILIES, baseline.role, candidate.role),
    type: typeA || typeB ? Number(typeA === typeB) : undefined,
    accessibleName:
      baseline.accessibleName || candidate.accessibleName
        ? textSimilarity(baseline.accessibleName, candidate.accessibleName)
        : undefined,
    text: baseline.text || candidate.text ? textSimilarity(baseline.text, candidate.text) : undefined,
    attributes: (() => {
      const a = attributeTokens(baseline);
      const b = attributeTokens(candidate);
      return a.length || b.length ? setSimilarity(a, b) : undefined;
    })(),
    context: contextSimilarity(baseline.context, candidate.context),
    path: sequenceSimilarity(baseline.path, candidate.path),
    structure: (ratio(baseline.childCount, candidate.childCount) + ratio(baseline.textLength, candidate.textLength)) / 2,
  };

  let total = 0;
  let weightSum = 0;
  const breakdown: ScoreResult['breakdown'] = {};
  for (const [name, value] of Object.entries(features) as [keyof FeatureWeights, number | undefined][]) {
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

export function pickBest<T extends { score: number }>(ranked: readonly T[], threshold: number): T | undefined {
  return ranked[0] && ranked[0].score >= threshold ? ranked[0] : undefined;
}
