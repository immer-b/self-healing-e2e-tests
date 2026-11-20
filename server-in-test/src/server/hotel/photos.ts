import { randomUUID } from 'node:crypto';
import type { Actor } from './auditLog';
import type { Clock } from './clock';

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export interface Photo {
  id: string;
  contentType: string;
  data: Buffer;
  uploadedBy: Actor;
  uploadedAt: string;
}

/** Room photos taken at the end of a care round. Ids are random so URLs cannot be guessed. */
export function createPhotoStore(clock: Clock) {
  let photos = new Map<string, Photo>();
  return {
    save: (data: Buffer, contentType: string, uploadedBy: Actor): Photo => {
      const photo = { id: `pho-${randomUUID()}`, contentType, data, uploadedBy, uploadedAt: clock.now().toISOString() };
      photos.set(photo.id, photo);
      return photo;
    },
    get: (id: string) => photos.get(id),
    reset: () => {
      photos = new Map();
    },
  };
}

export type PhotoStore = ReturnType<typeof createPhotoStore>;
