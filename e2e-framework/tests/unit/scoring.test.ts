import { describe, it, expect } from 'vitest';
import { scoreFingerprint, rankCandidates, pickBest } from '../../src/healing/scoring';
import { fp } from './fingerprintFactory';

const v1Password = fp({
  tag: 'input', role: 'textbox', id: 'password', attributes: { name: 'password', type: 'password' },
  accessibleName: 'Password', context: { label: 'Password' }, path: ['form', 'main', 'div', 'body'],
});
const v2Username = fp({
  tag: 'input', role: 'textbox', classes: ['input-user'], attributes: { name: 'user', type: 'text', placeholder: 'Username' },
  accessibleName: 'Username', path: ['div', 'form', 'div', 'div', 'body'],
});
const v2Password = fp({
  tag: 'input', role: 'textbox', classes: ['input-pass'], attributes: { name: 'pass', type: 'password', placeholder: 'Password' },
  accessibleName: 'Password', path: ['div', 'form', 'div', 'div', 'body'],
});

describe('scoreFingerprint', () => {
  it('scores an identical fingerprint as 1', () => {
    expect(scoreFingerprint(v1Password, v1Password).score).toBeCloseTo(1);
  });

  it('returns a per-feature breakdown', () => {
    const { breakdown } = scoreFingerprint(v1Password, v2Password);
    expect(breakdown.tag).toBe(1);
    expect(breakdown.type).toBe(1);
    expect(breakdown.accessibleName).toBe(1);
  });

  it('prefers the matching input type and name when the markup changed', () => {
    expect(scoreFingerprint(v1Password, v2Password).score).toBeGreaterThan(scoreFingerprint(v1Password, v2Username).score);
  });

  it('gives partial credit for related tags and roles', () => {
    const row = fp({ tag: 'tr', role: 'row', childCount: 5 });
    const listItem = fp({ tag: 'li', role: 'listitem', childCount: 4 });
    const heading = fp({ tag: 'h1', role: 'heading', childCount: 0 });
    expect(scoreFingerprint(row, listItem).score).toBeGreaterThan(scoreFingerprint(row, heading).score);
  });

  it('down-weights own text when dynamicText is set', () => {
    const baseline = fp({ tag: 'tr', role: 'row', text: 'Alpha Project alice active', classes: ['row'] });
    const other = fp({ tag: 'tr', role: 'row', text: 'Beta Launch bob inactive', classes: ['row'] });
    expect(scoreFingerprint(baseline, other, { dynamicText: true }).score).toBeGreaterThan(
      scoreFingerprint(baseline, other).score,
    );
  });

  it('uses surrounding context such as labels and ancestor names', () => {
    const value = fp({ tag: 'span', text: '6', context: { label: 'Total records' } });
    const right = fp({ tag: 'dd', text: '6', context: { label: 'Records' } });
    const wrong = fp({ tag: 'dd', text: '6', context: { label: 'Pending' } });
    expect(scoreFingerprint(value, right).score).toBeGreaterThan(scoreFingerprint(value, wrong).score);
  });
});

describe('rankCandidates / pickBest', () => {
  const candidates = [
    { selector: '.input-user', fingerprint: v2Username },
    { selector: '.input-pass', fingerprint: v2Password },
  ];

  it('orders candidates by descending score', () => {
    const ranked = rankCandidates(v1Password, candidates);
    expect(ranked.map((c) => c.selector)).toEqual(['.input-pass', '.input-user']);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  const strict = { threshold: 0.99, minScore: 0.99, minMargin: 0 };

  it('returns the best candidate above the threshold', () => {
    expect(pickBest(rankCandidates(v1Password, candidates), { threshold: 0.5 })?.selector).toBe('.input-pass');
  });

  it('returns undefined when nothing clears the threshold', () => {
    expect(pickBest(rankCandidates(v1Password, candidates), strict)).toBeUndefined();
    expect(pickBest([], { threshold: 0.1 })).toBeUndefined();
  });

  const ranked = (...scores: [string, number][]) => scores.map(([selector, score]) => ({ selector, score }));

  it('accepts a below-threshold winner that clearly beats the runner-up', () => {
    const options = { threshold: 0.6, minScore: 0.45, minMargin: 0.1 };
    expect(pickBest(ranked(['a', 0.55], ['b', 0.3]), options)?.selector).toBe('a');
    expect(pickBest(ranked(['a', 0.55], ['b', 0.5]), options)).toBeUndefined();
    expect(pickBest(ranked(['a', 0.4], ['b', 0.1]), options)).toBeUndefined();
  });

  it('ignores runners-up from the same group when computing the margin', () => {
    const options = { threshold: 0.6, minScore: 0.45, minMargin: 0.1, groupOf: (s: string) => s.replace(/:nth-of-type\(\d+\)$/, '') };
    const rows = ranked(['ul > li:nth-of-type(1)', 0.55], ['ul > li:nth-of-type(2)', 0.5], ['h1', 0.2]);
    expect(pickBest(rows, options)?.selector).toBe('ul > li:nth-of-type(1)');
  });
});

describe('dynamic text weighting', () => {
  it('shifts weight from text to context so labelled values still match', () => {
    const value = fp({ tag: 'span', classes: ['value'], text: '6', context: { label: 'Total records' } });
    const right = fp({ tag: 'dd', role: 'definition', text: '6', context: { label: 'Records' } });
    expect(scoreFingerprint(value, right, { dynamicText: true }).score).toBeGreaterThan(0.5);
  });

  it('skips the role feature when the baseline has no role', () => {
    const { breakdown } = scoreFingerprint(fp({ tag: 'span' }), fp({ tag: 'dd', role: 'definition' }));
    expect(breakdown.role).toBeUndefined();
  });
});

describe('collection items', () => {
  it('ignores data-dependent text and sibling context when ignoreContent is set', () => {
    const row = fp({ tag: 'tr', role: 'row', text: 'Beta Launch bob', childCount: 5, context: { label: 'Epsilon Research dave' } });
    const card = fp({ tag: 'li', role: 'listitem', text: 'Zeta Rollout bob', childCount: 4 });
    const { breakdown, score } = scoreFingerprint(row, card, { ignoreContent: true });
    expect(breakdown.text).toBeUndefined();
    expect(breakdown.context).toBeUndefined();
    expect(score).toBeGreaterThan(0.45);
  });
});
