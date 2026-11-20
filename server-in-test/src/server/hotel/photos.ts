import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Actor } from './auditLog';
import type { Clock } from './clock';
import { memoryPersistence, type Persistence } from './persistence';

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export interface Photo {
  id: string;
  contentType: string;
  data: Buffer;
  uploadedBy: Actor;
  uploadedAt: string;
}

type PhotoMeta = Omit<Photo, 'data'>;

const VALID_ID = /^pho-[0-9a-f-]{36}$/;

/**
 * Room photos taken at the end of a care round. Ids are random so URLs cannot be guessed.
 * With `dir`, image bytes are written to that folder (one file per photo, named by id) and the
 * metadata goes to `persistence`; without it everything stays in memory.
 */
export function createPhotoStore(clock: Clock, { dir, persistence = memoryPersistence() }: { dir?: string; persistence?: Persistence } = {}) {
  if (dir) mkdirSync(dir, { recursive: true });
  let metas = new Map(persistence.loadAll<PhotoMeta>('photos').map((m) => [m.id, m]));
  let bytes = new Map<string, Buffer>(); // used when there is no folder

  return {
    save: (data: Buffer, contentType: string, uploadedBy: Actor): Photo => {
      const meta: PhotoMeta = { id: `pho-${randomUUID()}`, contentType, uploadedBy, uploadedAt: clock.now().toISOString() };
      if (dir) writeFileSync(join(dir, meta.id), data);
      else bytes.set(meta.id, data);
      metas.set(meta.id, meta);
      persistence.put('photos', meta.id, meta);
      return { ...meta, data };
    },
    get: (id: string): Photo | undefined => {
      if (!VALID_ID.test(id)) return undefined; // also stops path traversal
      const meta = metas.get(id);
      if (!meta) return undefined;
      try {
        return { ...meta, data: dir ? readFileSync(join(dir, id)) : bytes.get(id)! };
      } catch {
        return undefined;
      }
    },
    reset: () => {
      if (dir) for (const id of metas.keys()) rmSync(join(dir, id), { force: true });
      metas = new Map();
      bytes = new Map();
      persistence.clear('photos');
    },
  };
}

export type PhotoStore = ReturnType<typeof createPhotoStore>;
