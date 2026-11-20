import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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

/** One JSON document per element, so parallel workers never rewrite each other's files. */
export function createFileSystemStore({ dir }: FileSystemStoreOptions): ElementStore {
  const pageDir = (pageId: string) => join(dir, encodeName(pageId));
  const elementFile = (pageId: string, key: string) => join(pageDir(pageId), `${encodeName(key)}.json`);

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
      const target = elementFile(record.pageId, record.elementKey);
      const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temp, JSON.stringify(record, null, 2));
      await rename(temp, target);
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
