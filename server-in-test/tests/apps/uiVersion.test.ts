import { describe, it, expect } from 'vitest';
import { parseUiVersion } from '../../src/apps/shared/uiVersion';

describe('parseUiVersion', () => {
  it.each([
    ['?v=1', 1],
    ['?v=2', 2],
    ['?v=3', 3],
    ['?foo=bar&v=3', 3],
  ])('reads %s as version %i', (search, expected) => {
    expect(parseUiVersion(search)).toBe(expected);
  });

  it.each(['', '?v=9', '?v=abc'])('defaults %j to version 1', (search) => {
    expect(parseUiVersion(search)).toBe(1);
  });
});
