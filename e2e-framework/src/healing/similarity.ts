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
  const containment = longer.includes(shorter) ? 0.6 + 0.4 * (shorter.length / longer.length) : 0;
  const tokens = setSimilarity(tokenize(na), tokenize(nb));
  const dice = diceCoefficient(na, nb);

  return Math.min(0.95, Math.max(containment, tokens, dice));
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
