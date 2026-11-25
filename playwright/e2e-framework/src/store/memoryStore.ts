import type { ElementRecord } from '../fingerprint/types';
import type { ElementStore } from './types';

const clone = <T>(value: T): T => structuredClone(value);

/** Non-persistent store, handy for unit tests and as the backing store of a store server. */
export function createMemoryStore(): ElementStore {
  const pages = new Map<string, Map<string, ElementRecord>>();

  return {
    async get(pageId, elementKey) {
      const found = pages.get(pageId)?.get(elementKey);
      return found && clone(found);
    },
    async put(record) {
      if (!pages.has(record.pageId)) pages.set(record.pageId, new Map());
      pages.get(record.pageId)!.set(record.elementKey, clone(record));
    },
    async listPages() {
      return [...pages.keys()].filter((p) => pages.get(p)!.size > 0);
    },
    async listElements(pageId) {
      return [...(pages.get(pageId)?.values() ?? [])].map(clone);
    },
    async remove(pageId, elementKey) {
      return pages.get(pageId)?.delete(elementKey) ?? false;
    },
  };
}
