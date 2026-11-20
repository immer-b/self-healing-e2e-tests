// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseUiVersion, readServerUiVersion, versionedHref } from '../../src/apps/shared/uiVersion';

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

describe('default version from the server', () => {
  const docWith = (content?: string) => {
    const doc = document.implementation.createHTMLDocument();
    if (content) doc.head.innerHTML = `<meta name="ui-version" content="${content}">`;
    return doc;
  };

  it('reads the version the server injected into the page', () => {
    expect(readServerUiVersion(docWith('2'))).toBe(2);
    expect(readServerUiVersion(docWith())).toBe(1);
    expect(readServerUiVersion(docWith('nope'))).toBe(1);
  });

  it('uses the server default unless ?v= overrides it', () => {
    expect(parseUiVersion('', 3)).toBe(3);
    expect(parseUiVersion('?v=2', 3)).toBe(2);
  });

  it('only adds ?v= to links when the version differs from the server default', () => {
    expect(versionedHref('/query/', 2, 2)).toBe('/query/');
    expect(versionedHref('/query/', 3, 1)).toBe('/query/?v=3');
  });
});
