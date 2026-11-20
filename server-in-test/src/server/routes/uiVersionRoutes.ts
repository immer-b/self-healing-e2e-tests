import { Router } from 'express';
import { UI_VERSIONS, type UiVersion } from '../types';

const isUiVersion = (value: unknown): value is UiVersion => (UI_VERSIONS as readonly unknown[]).includes(value);

/** The layout every app renders. Lives in memory and can be changed at runtime. */
export function createUiVersionState(initial: UiVersion = 1) {
  let current = initial;
  return {
    get: () => current,
    set: (version: UiVersion) => {
      current = version;
    },
  };
}

export type UiVersionState = ReturnType<typeof createUiVersionState>;

/**
 * GET /api/ui-version -> { version }
 * PUT /api/ui-version <- { version: 1 | 2 | 3 }  (open pages pick it up within a second)
 */
export function uiVersionRoutes(state: UiVersionState) {
  return Router()
    .get('/', (_req, res) => {
      res.json({ version: state.get() });
    })
    .put('/', (req, res) => {
      const { version } = req.body ?? {};
      if (!isUiVersion(version)) {
        res.status(400).json({ error: 'version must be 1, 2 or 3' });
        return;
      }
      state.set(version);
      res.json({ version });
    });
}
