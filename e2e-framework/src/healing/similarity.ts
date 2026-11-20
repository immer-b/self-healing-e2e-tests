/** Pure string/collection similarity helpers. Every function returns a score in [0, 1]. */

export const normalizeText = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** Splits identifiers and prose into lowercase word tokens (camelCase, kebab-case, snake_case, spaces). */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Jaccard index of two collections treated as sets. */
export function setSimilarity(a: Iterable<string>, b: Iterable<string>): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  return intersection / (setA.size + setB.size - intersection);
}

const bigrams = (text: string) => {
  const grams: string[] = [];
  for (let i = 0; i < text.length - 1; i++) grams.push(text.slice(i, i + 2));
  return grams;
};

/** Sørensen–Dice coefficient over character bigrams (whitespace removed). */
function diceCoefficient(a: string, b: string): number {
  const gramsA = bigrams(a.replace(/\s/g, ''));
  const gramsB = bigrams(b.replace(/\s/g, ''));
  if (!gramsA.length || !gramsB.length) return 0;
  const counts = new Map<string, number>();
  gramsA.forEach((g) => counts.set(g, (counts.get(g) ?? 0) + 1));
  let overlap = 0;
  for (const g of gramsB) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      overlap++;
      counts.set(g, n - 1);
    }
  }
  return (2 * overlap) / (gramsA.length + gramsB.length);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `needle` appears in `haystack` as whole words ("records" in "total records", not "active" in "inactive"). */
const containsWords = (haystack: string, needle: string) =>
  new RegExp(String.raw`(^|[^\p{L}\p{N}])${escapeRegExp(needle)}($|[^\p{L}\p{N}])`, 'u').test(haystack);

/** Scores the case where every word of the shorter text occurs in the longer one ("Export CSV" / "Export report as CSV"). */
function tokenSubsetScore(a: string[], b: string[]): number {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (!shorter.length) return 0;
  const longerSet = new Set(longer);
  return shorter.every((t) => longerSet.has(t)) ? 0.6 + 0.4 * (new Set(shorter).size / longerSet.size) : 0;
}

/** Reduces text to its format: digit runs -> "9", letter runs -> "a" ("$7,800" -> "$9,9"). */
export const textShape = (text: string) =>
  normalizeText(text).replace(/\p{N}+/gu, '9').replace(/\p{L}+/gu, 'a');

/** Compares the format of two texts: identical shapes score 1, otherwise bigram overlap of the shapes. */
export function shapeSimilarity(a: string, b: string): number {
  const shapeA = textShape(a);
  const shapeB = textShape(b);
  if (!shapeA || !shapeB) return 0;
  return shapeA === shapeB ? 1 : diceCoefficient(shapeA, shapeB);
}

/**
 * Fuzzy text similarity combining exact match, containment, token overlap and character bigrams.
 * Non-identical strings are capped below 1 so exact matches always win ties.
 */
export function textSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  const containment = containsWords(longer, shorter) ? 0.6 + 0.4 * (shorter.length / longer.length) : 0;
  const tokensA = tokenize(na);
  const tokensB = tokenize(nb);
  const tokens = setSimilarity(tokensA, tokensB);
  const subset = tokenSubsetScore(tokensA, tokensB);
  const dice = diceCoefficient(na, nb);

  return Math.min(0.95, Math.max(containment, tokens, subset, dice));
}

/** Longest-common-subsequence ratio for ordered sequences such as ancestor tag paths. */
export function sequenceSimilarity(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length] / Math.max(a.length, b.length);
}
