import type { ElementRecord } from '../fingerprint/types';
import type { ElementStore } from './types';

type Filter = Record<string, unknown>;

/**
 * The subset of a MongoDB `Collection` this store needs. A real `db.collection('elements')`
 * from the official `mongodb` driver satisfies it, so no driver dependency is required here.
 */
export interface DocumentCollection {
  findOne(filter: Filter): Promise<Record<string, unknown> | null>;
  find(filter: Filter): { toArray(): Promise<Record<string, unknown>[]> };
  replaceOne(filter: Filter, doc: Record<string, unknown>, options?: { upsert?: boolean }): Promise<unknown>;
  deleteOne(filter: Filter): Promise<{ deletedCount?: number }>;
  distinct(field: string, filter?: Filter): Promise<unknown[]>;
}

const toRecord = (doc: Record<string, unknown>): ElementRecord => {
  const { _id, ...record } = doc;
  return record as unknown as ElementRecord;
};

/**
 * NoSQL document store: one document per element, keyed by `{ pageId, elementKey }`.
 * Recommended index: `{ pageId: 1, elementKey: 1 }` (unique).
 */
export function createDocumentStore(collection: DocumentCollection): ElementStore {
  const key = (pageId: string, elementKey: string) => ({ pageId, elementKey });

  return {
    async get(pageId, elementKey) {
      const doc = await collection.findOne(key(pageId, elementKey));
      return doc ? toRecord(doc) : undefined;
    },
    async put(record) {
      await collection.replaceOne(key(record.pageId, record.elementKey), { ...record }, { upsert: true });
    },
    async listPages() {
      return (await collection.distinct('pageId')) as string[];
    },
    async listElements(pageId) {
      return (await collection.find({ pageId }).toArray()).map(toRecord);
    },
    async remove(pageId, elementKey) {
      return ((await collection.deleteOne(key(pageId, elementKey))).deletedCount ?? 0) > 0;
    },
  };
}
