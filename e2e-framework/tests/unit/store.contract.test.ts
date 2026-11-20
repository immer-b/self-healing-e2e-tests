import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { ElementStore } from '../../src/store/types';
import type { ElementRecord } from '../../src/fingerprint/types';
import { createMemoryStore } from '../../src/store/memoryStore';
import { createFileSystemStore } from '../../src/store/fileSystemStore';
import { createRemoteStore } from '../../src/store/remoteStore';
import { createStoreServer } from '../../src/store/storeServer';
import { createDocumentStore, type DocumentCollection } from '../../src/store/documentStore';
import { fp } from './fingerprintFactory';

const record = (pageId: string, elementKey: string, selector = `#${elementKey}`): ElementRecord => ({
  pageId,
  elementKey,
  selector,
  fingerprint: fp({ tag: 'input', id: elementKey }),
  updatedAt: '2026-01-01T00:00:00.000Z',
});

/** Minimal in-memory implementation of the MongoDB Collection methods the document store uses. */
function fakeCollection(): DocumentCollection {
  let docs: Record<string, unknown>[] = [];
  const matches = (doc: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([k, v]) => doc[k] === v);
  return {
    findOne: async (filter) => (docs.find((d) => matches(d, filter)) ?? null) as never,
    find: (filter) => ({ toArray: async () => docs.filter((d) => matches(d, filter)) as never }),
    replaceOne: async (filter, doc) => {
      docs = docs.filter((d) => !matches(d, filter)).concat({ ...doc });
      return {} as never;
    },
    deleteOne: async (filter) => {
      const before = docs.length;
      docs = docs.filter((d) => !matches(d, filter));
      return { deletedCount: before - docs.length };
    },
    distinct: async (field) => [...new Set(docs.map((d) => d[field]))] as never,
  };
}

interface Harness {
  store: ElementStore;
  teardown: () => Promise<void>;
}

const harnesses: Record<string, () => Promise<Harness>> = {
  memory: async () => ({ store: createMemoryStore(), teardown: async () => {} }),
  filesystem: async () => {
    const dir = mkdtempSync(join(tmpdir(), 'heal-store-'));
    return { store: createFileSystemStore({ dir }), teardown: async () => rmSync(dir, { recursive: true, force: true }) };
  },
  remote: async () => {
    const server: Server = createStoreServer(createMemoryStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    return {
      store: createRemoteStore({ baseUrl: `http://127.0.0.1:${port}` }),
      teardown: () => new Promise((resolve) => server.close(() => resolve())),
    };
  },
  document: async () => ({ store: createDocumentStore(fakeCollection()), teardown: async () => {} }),
};

describe.each(Object.keys(harnesses))('%s element store', (name) => {
  let harness: Harness;
  beforeEach(async () => {
    harness = await harnesses[name]();
  });
  afterEach(() => harness.teardown());

  it('returns undefined for unknown elements', async () => {
    expect(await harness.store.get('login', 'missing')).toBeUndefined();
  });

  it('round-trips a record by page and element key', async () => {
    await harness.store.put(record('login', 'username'));
    expect(await harness.store.get('login', 'username')).toEqual(record('login', 'username'));
  });

  it('overwrites an existing record', async () => {
    await harness.store.put(record('login', 'username', '#old'));
    await harness.store.put(record('login', 'username', '#new'));
    expect((await harness.store.get('login', 'username'))?.selector).toBe('#new');
  });

  it('lists pages and the elements of a page', async () => {
    await harness.store.put(record('login', 'username'));
    await harness.store.put(record('login', 'password'));
    await harness.store.put(record('report', 'total'));
    expect((await harness.store.listPages()).sort()).toEqual(['login', 'report']);
    expect((await harness.store.listElements('login')).map((r) => r.elementKey).sort()).toEqual(['password', 'username']);
    expect(await harness.store.listElements('nope')).toEqual([]);
  });

  it('supports keys with characters that are unsafe in paths or URLs', async () => {
    await harness.store.put(record('query/results', 'row:actions #1'));
    expect((await harness.store.get('query/results', 'row:actions #1'))?.elementKey).toBe('row:actions #1');
  });

  it('removes a record', async () => {
    await harness.store.put(record('login', 'username'));
    expect(await harness.store.remove('login', 'username')).toBe(true);
    expect(await harness.store.remove('login', 'username')).toBe(false);
    expect(await harness.store.get('login', 'username')).toBeUndefined();
  });
});
