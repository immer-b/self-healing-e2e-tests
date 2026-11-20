import type { ElementFingerprint, ElementRecord } from '../fingerprint/types';
import type { ElementStore } from '../store/types';
import { missingBaselineError } from './errors';
import type { LocateSpec } from './types';

/** Reads and writes baseline fingerprints, skipping writes when nothing changed since the last save. */
export function createBaselines(store: ElementStore) {
  const lastSaved = new Map<string, string>();

  return {
    async save(pageId: string, spec: LocateSpec, fingerprint: ElementFingerprint) {
      const memoKey = `${pageId}|${spec.key}`;
      const serialised = JSON.stringify(fingerprint);
      if (lastSaved.get(memoKey) === serialised) return;
      const record: ElementRecord = {
        pageId,
        elementKey: spec.key,
        selector: spec.selector,
        fingerprint,
        updatedAt: new Date().toISOString(),
      };
      await store.put(record);
      lastSaved.set(memoKey, serialised);
    },

    async load(pageId: string, spec: LocateSpec): Promise<ElementRecord> {
      const record = await store.get(pageId, spec.key);
      if (!record) throw missingBaselineError(pageId, spec);
      return record;
    },
  };
}

export type Baselines = ReturnType<typeof createBaselines>;
