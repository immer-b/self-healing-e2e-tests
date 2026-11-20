import { UI_VERSIONS, type UiVersion } from '../../server/types';

export { UI_VERSIONS, type UiVersion };

const toVersion = (value: unknown): UiVersion | undefined => {
  const n = Number(value);
  return value != null && (UI_VERSIONS as readonly number[]).includes(n) ? (n as UiVersion) : undefined;
};

/** Default layout injected by the server as a ui-version meta tag (see spaRoutes). Falls back to 1. */
export function readServerUiVersion(doc: Document): UiVersion {
  return toVersion(doc.querySelector('meta[name="ui-version"]')?.getAttribute('content')) ?? 1;
}

/** The `?v=` query parameter overrides the server default. */
export function parseUiVersion(search: string, fallback: UiVersion = 1): UiVersion {
  return toVersion(new URLSearchParams(search).get('v')) ?? fallback;
}

/** Links to another app keep the version, adding ?v= only when it differs from the server default. */
export function versionedHref(path: string, version: UiVersion, serverDefault: UiVersion): string {
  return version === serverDefault ? path : `${path}?v=${version}`;
}
