import type { ElementFingerprint } from '../fingerprint/types';
import { sequenceSimilarity, setSimilarity, shapeSimilarity, textSimilarity, tokenize } from './similarity';

/**
 * Each feature compares one aspect of a baseline fingerprint with a candidate and returns a
 * similarity in [0, 1], or `undefined` when the baseline has nothing to compare (the feature is then
 * skipped, so candidates are never penalised for information the baseline lacked).
 */
export interface FeatureContext {
  dynamicText: boolean;
  ignoreContent: boolean;
}

type Feature = (baseline: ElementFingerprint, candidate: ElementFingerprint, ctx: FeatureContext) => number | undefined;

/** Tags that commonly replace each other in a redesign (e.g. table rows becoming list items). */
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

/** 1 for identical values, 0.5 for members of the same family, 0 otherwise. */
const familyMatch = (families: string[][], a: string, b: string) => {
  if (a === b) return 1;
  return families.some((f) => f.includes(a) && f.includes(b)) ? 0.5 : 0;
};

const ratio = (a: number, b: number) => 1 - Math.abs(a - b) / Math.max(a, b, 1);

/** Bag of identifier-ish tokens: id, classes and descriptive attributes. */
const attributeTokens = (f: ElementFingerprint) =>
  tokenize([f.id, ...f.classes, ...Object.entries(f.attributes).filter(([k]) => k !== 'type').map(([, v]) => v)].join(' '));

function contextSimilarity(a: ElementFingerprint['context'], b: ElementFingerprint['context']): number | undefined {
  const slots: [string, string][] = [
    [a.label, b.label],
    [a.ancestorLabels.join(' '), b.ancestorLabels.join(' ')],
    [a.parentText, b.parentText],
  ];
  const present = slots.filter(([x]) => x);
  if (!present.length) return undefined;

  // A direct label match is the most specific signal, so it is not diluted by the other slots.
  const labelMatch = textSimilarity(a.label, b.label);
  const aligned = present.reduce((sum, [x, y]) => sum + textSimilarity(x, y), 0) / present.length;
  // The baseline's label may now live in a different slot (e.g. a sibling became an aria-label).
  const aValues = slots.map(([x]) => x).filter(Boolean);
  const bValues = slots.map(([, y]) => y).filter(Boolean);
  const crossSlot = Math.max(0, ...aValues.flatMap((x) => bValues.map((y) => textSimilarity(x, y))));

  return Math.max(labelMatch, aligned, crossSlot * 0.9);
}

export const FEATURES = {
  tag: (b, c) => familyMatch(TAG_FAMILIES, b.tag, c.tag),

  role: (b, c) => (b.role ? familyMatch(ROLE_FAMILIES, b.role, c.role) : undefined),

  type: (b, c) => (b.attributes.type ? Number(b.attributes.type === c.attributes.type) : undefined),

  accessibleName: (b, c) => (b.accessibleName ? textSimilarity(b.accessibleName, c.accessibleName) : undefined),

  text: (b, c, { dynamicText, ignoreContent }) => {
    if (!b.text || ignoreContent) return undefined;
    // Changing values keep their format ("$1,200" -> "$1,350"), so compare shapes instead of content.
    return dynamicText ? shapeSimilarity(b.text, c.text) : textSimilarity(b.text, c.text);
  },

  attributes: (b, c) => {
    const tokens = attributeTokens(b);
    return tokens.length ? setSimilarity(tokens, attributeTokens(c)) : undefined;
  },

  context: (b, c, { ignoreContent }) => (ignoreContent ? undefined : contextSimilarity(b.context, c.context)),

  path: (b, c) => sequenceSimilarity(b.path, c.path),

  structure: (b, c) => (ratio(b.childCount, c.childCount) + ratio(b.textLength, c.textLength)) / 2,
} satisfies Record<string, Feature>;

export type FeatureName = keyof typeof FEATURES;
