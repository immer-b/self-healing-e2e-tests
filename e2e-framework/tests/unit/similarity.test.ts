import { describe, it, expect } from 'vitest';
import { textSimilarity, tokenize, setSimilarity, sequenceSimilarity } from '../../src/healing/similarity';

describe('tokenize', () => {
  it('splits camelCase, kebab, snake and whitespace into lowercase tokens', () => {
    expect(tokenize('loginButton submit-form user_name  Foo')).toEqual(['login', 'button', 'submit', 'form', 'user', 'name', 'foo']);
  });

  it('drops punctuation and empty tokens', () => {
    expect(tokenize('  ⋯ (Save!) ')).toEqual(['save']);
  });
});

describe('textSimilarity', () => {
  it('is 1 for identical text ignoring case and whitespace', () => {
    expect(textSimilarity('Log  in', 'log in')).toBe(1);
  });

  it('is 0 when either side is empty', () => {
    expect(textSimilarity('', 'abc')).toBe(0);
  });

  it('rewards containment and shared tokens', () => {
    expect(textSimilarity('Edit', 'Edit record')).toBeGreaterThan(0.6);
    expect(textSimilarity('View', 'View details')).toBeGreaterThan(0.6);
  });

  it('scores near-miss spellings above unrelated words', () => {
    expect(textSimilarity('Log in', 'Login')).toBeGreaterThan(textSimilarity('Log in', 'Delete'));
  });

  it('scores unrelated text low', () => {
    expect(textSimilarity('Password', 'Search records')).toBeLessThan(0.3);
  });
});

describe('setSimilarity', () => {
  it('computes the Jaccard index', () => {
    expect(setSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(setSimilarity([], [])).toBe(0);
  });
});

describe('sequenceSimilarity', () => {
  it('compares ordered sequences via longest common subsequence', () => {
    expect(sequenceSimilarity(['form', 'main', 'body'], ['form', 'div', 'main', 'body'])).toBeCloseTo(0.75);
    expect(sequenceSimilarity(['a'], ['b'])).toBe(0);
  });
});
