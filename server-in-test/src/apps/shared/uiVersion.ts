export const UI_VERSIONS = [1, 2, 3] as const;
export type UiVersion = (typeof UI_VERSIONS)[number];

/** Reads the `v` query parameter that selects which UI layout to render. Defaults to 1. */
export function parseUiVersion(search: string): UiVersion {
  const value = Number(new URLSearchParams(search).get('v'));
  return (UI_VERSIONS as readonly number[]).includes(value) ? (value as UiVersion) : 1;
}
