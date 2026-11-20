import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { UiVersion } from './uiVersion';

/** How often open pages check whether the UI version was changed via PUT /api/ui-version. */
export const UI_VERSION_POLL_MS = 1000;

/**
 * The UI version currently selected on the server. Polls so that a version changed elsewhere
 * (another tab, a script, a test) shows up without reloading the page.
 */
export function useUiVersion(pollMs = UI_VERSION_POLL_MS) {
  const [version, setVersion] = useState<UiVersion>();

  useEffect(() => {
    let active = true;
    const load = () =>
      api.getUiVersion().then(
        ({ version: current }) => active && setVersion(current),
        () => {}, // keep the current layout if the server is briefly unavailable
      );
    load();
    const timer = setInterval(load, pollMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pollMs]);

  const changeVersion = useCallback(async (next: UiVersion) => {
    const { version: current } = await api.setUiVersion(next);
    setVersion(current);
  }, []);

  return { version, changeVersion };
}
