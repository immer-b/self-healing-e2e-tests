import type { ElementRecord } from '../fingerprint/types';

/**
 * Persistence for element fingerprints, addressed as page -> element.
 * Implementations: memory, filesystem (JSON per element), remote (HTTP) and document (MongoDB-style).
 */
export interface ElementStore {
  get(pageId: string, elementKey: string): Promise<ElementRecord | undefined>;
  put(record: ElementRecord): Promise<void>;
  listPages(): Promise<string[]>;
  listElements(pageId: string): Promise<ElementRecord[]>;
  remove(pageId: string, elementKey: string): Promise<boolean>;
}
