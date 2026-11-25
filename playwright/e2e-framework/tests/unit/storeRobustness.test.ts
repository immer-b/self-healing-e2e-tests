import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createFileSystemStore } from '../../src/store/fileSystemStore';
import { createMemoryStore } from '../../src/store/memoryStore';
import { createRemoteStore } from '../../src/store/remoteStore';
import { createStoreServer } from '../../src/store/storeServer';
import type { ElementStore } from '../../src/store/types';
import type { ElementRecord } from '../../src/fingerprint/types';
import { fp } from './fingerprintFactory';

const record = (elementKey: string, selector: string): ElementRecord => ({
  pageId: 'page',
  elementKey,
  selector,
  fingerprint: fp({ id: selector }),
  updatedAt: new Date().toISOString(),
});

describe('filesystem store under concurrent writes', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  const store = () => {
    const dir = mkdtempSync(join(tmpdir(), 'heal-fs-'));
    dirs.push(dir);
    return createFileSystemStore({ dir });
  };

  it('keeps a valid record when many writers update the same element at once', async () => {
    const s = store();
    await Promise.all(Array.from({ length: 25 }, (_, i) => s.put(record('shared', `#v${i}`))));
    const saved = await s.get('page', 'shared');
    expect(saved?.selector).toMatch(/^#v\d+$/);
    expect(await s.listElements('page')).toHaveLength(1);
  });

  it('keeps every record when writers update different elements at once', async () => {
    const s = store();
    await Promise.all(Array.from({ length: 25 }, (_, i) => s.put(record(`el-${i}`, `#el${i}`))));
    expect(await s.listElements('page')).toHaveLength(25);
  });
});

describe('remote store error handling', () => {
  let server: Server;
  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('surfaces backend failures as rejected promises', async () => {
    const failing: ElementStore = { ...createMemoryStore(), get: async () => { throw new Error('disk full'); } };
    server = createStoreServer(failing);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const remote = createRemoteStore({ baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` });
    await expect(remote.get('page', 'x')).rejects.toThrow(/500/);
    expect(await remote.listPages()).toEqual([]); // trailing slash in baseUrl is tolerated
  });
});
