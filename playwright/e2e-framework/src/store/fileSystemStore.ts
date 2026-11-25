import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ElementRecord } from '../fingerprint/types';
import type { ElementStore } from './types';

export interface FileSystemStoreOptions {
  /** Root folder. Layout: `<dir>/<pageId>/<elementKey>.json` (names URI-encoded). */
  dir: string;
}

/** Encodes a name so it is safe as a file or folder name on every OS. */
const encodeName = (name: string) => encodeURIComponent(name).replace(/\*/g, '%2A').replace(/\./g, '%2E');
const decodeName = (name: string) => decodeURIComponent(name);

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

/** Windows briefly locks a file that another rename is replacing; these errors are worth retrying. */
const isTransientLock = (error: unknown) => ['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '');

/** Atomically replaces `target`: write a uniquely named temp file, then rename it over the target. */
async function writeAtomically(target: string, content: string, attempts = 10) {
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, content);
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(temp, target);
      return;
    } catch (error) {
      if (!isTransientLock(error) || attempt >= attempts) {
        await rm(temp, { force: true });
        throw error;
      }
      // Jittered backoff so competing processes don't retry in lockstep.
      await new Promise((resolve) => setTimeout(resolve, 5 * attempt + Math.random() * 20));
    }
  }
}

/**
 * Serialises writes per file within this process (no self-contention); `writeAtomically`'s retry
 * covers contention with other worker processes.
 */
function createWriteQueue() {
  const tails = new Map<string, Promise<void>>();
  return (file: string, write: () => Promise<void>) => {
    const next = (tails.get(file) ?? Promise.resolve()).catch(() => {}).then(write);
    tails.set(file, next);
    void next.finally(() => tails.get(file) === next && tails.delete(file)).catch(() => {});
    return next;
  };
}

/** One JSON document per element, so parallel workers never rewrite each other's files. */
export function createFileSystemStore({ dir }: FileSystemStoreOptions): ElementStore {
  const pageDir = (pageId: string) => join(dir, encodeName(pageId));
  const elementFile = (pageId: string, key: string) => join(pageDir(pageId), `${encodeName(key)}.json`);
  const enqueueWrite = createWriteQueue();

  const readRecord = async (file: string): Promise<ElementRecord | undefined> => {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  };

  const listDir = async (path: string) => {
    try {
      return await readdir(path);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  };

  return {
    get: (pageId, elementKey) => readRecord(elementFile(pageId, elementKey)),

    async put(record) {
      await mkdir(pageDir(record.pageId), { recursive: true });
      const file = elementFile(record.pageId, record.elementKey);
      await enqueueWrite(file, () => writeAtomically(file, JSON.stringify(record, null, 2)));
    },

    async listPages() {
      const pages = await listDir(dir);
      const nonEmpty = await Promise.all(
        pages.map(async (p) => ((await listDir(join(dir, p))).some((f) => f.endsWith('.json')) ? decodeName(p) : undefined)),
      );
      return nonEmpty.filter((p): p is string => p !== undefined);
    },

    async listElements(pageId) {
      const files = (await listDir(pageDir(pageId))).filter((f) => f.endsWith('.json'));
      const records = await Promise.all(files.map((f) => readRecord(join(pageDir(pageId), f))));
      return records.filter((r): r is ElementRecord => r !== undefined);
    },

    async remove(pageId, elementKey) {
      const file = elementFile(pageId, elementKey);
      if (!(await readRecord(file))) return false;
      await rm(file);
      return true;
    },
  };
}
