import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';
import { createSqlitePersistence } from '../../../src/server/hotel/persistence';
import { createPhotoStore } from '../../../src/server/hotel/photos';
import { hotelStorage } from '../../../src/server/config';

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'hotel-data-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const actor = { id: 'emp-2', name: 'Priya Shah' };
const clock = () => createClock(new Date('2026-11-20T08:00:00'));

describe('SQLite persistence', () => {
  it('stores, loads and clears documents per collection', () => {
    const file = join(tempDir(), 'hotel.db');
    const db = createSqlitePersistence(file);
    db.put('pets', 'pet-1', { id: 'pet-1', name: 'Biscuit' });
    db.put('pets', 'pet-2', { id: 'pet-2', name: 'Mochi' });
    db.put('pets', 'pet-1', { id: 'pet-1', name: 'Biscuit II' });
    db.put('rooms', 'room-1', { id: 'room-1' });
    db.close();

    const reopened = createSqlitePersistence(file);
    expect(reopened.loadAll('pets')).toEqual([{ id: 'pet-1', name: 'Biscuit II' }, { id: 'pet-2', name: 'Mochi' }]);
    reopened.clear('pets');
    expect(reopened.loadAll('pets')).toEqual([]);
    expect(reopened.loadAll('rooms')).toHaveLength(1);
    reopened.close();
  });
});

describe('a hotel backed by SQLite', () => {
  it('seeds an empty database once and keeps changes across restarts', () => {
    const dir = tempDir();
    const first = createHotel({ clock: clock(), persistence: createSqlitePersistence(join(dir, 'hotel.db')) });
    const created = first.pets.create({ name: 'Ziggy', species: 'cat', breed: 'Tabby', ownerId: 'own-1', specialInstructions: '' }, actor).value!;
    first.notes.add(created.id, { text: 'Arrived calm.' }, actor);
    first.close();

    const restarted = createHotel({ clock: clock(), persistence: createSqlitePersistence(join(dir, 'hotel.db')) });
    expect(restarted.pets.get(created.id)).toMatchObject({ name: 'Ziggy' });
    expect(restarted.pets.list()).toHaveLength(9); // 8 seeded + Ziggy: not seeded twice
    expect(restarted.notes.list(created.id)[0].text).toBe('Arrived calm.');
    expect(restarted.audit.list({ entityId: created.id }).map((e) => e.action)).toEqual(['create']);
    expect(restarted.employees.authenticate('admin', 'password123')).toBeTruthy();
    const next = restarted.pets.create({ name: 'Nova', species: 'dog', breed: 'Corgi', ownerId: 'own-1', specialInstructions: '' }, actor).value!;
    expect(next.id).toBe('pet-10'); // ids continue after a restart
    restarted.close();
  });

  it('restores the seed on reset', () => {
    const dir = tempDir();
    const hotel = createHotel({ clock: clock(), persistence: createSqlitePersistence(join(dir, 'hotel.db')) });
    hotel.pets.create({ name: 'Ziggy', species: 'cat', breed: 'Tabby', ownerId: 'own-1', specialInstructions: '' }, actor);
    hotel.reset();
    hotel.close();
    const restarted = createHotel({ clock: clock(), persistence: createSqlitePersistence(join(dir, 'hotel.db')) });
    expect(restarted.pets.list().map((p) => p.name)).not.toContain('Ziggy');
    expect(restarted.pets.list()).toHaveLength(8);
    restarted.close();
  });
});

describe('photos on disk', () => {
  it('writes photos to a folder and reads them back after a restart', () => {
    const dir = tempDir();
    const db = join(dir, 'hotel.db');
    const firstDb = createSqlitePersistence(db);
    const store = createPhotoStore(clock(), { dir: join(dir, 'photos'), persistence: firstDb });
    const saved = store.save(Buffer.from('fake-png'), 'image/png', actor);
    expect(readdirSync(join(dir, 'photos'))).toEqual([saved.id]);
    firstDb.close();

    const secondDb = createSqlitePersistence(db);
    const reopened = createPhotoStore(clock(), { dir: join(dir, 'photos'), persistence: secondDb });
    const photo = reopened.get(saved.id)!;
    expect(photo.contentType).toBe('image/png');
    expect(photo.data.toString()).toBe('fake-png');
    expect(photo.uploadedBy).toEqual(actor);
    reopened.reset();
    expect(existsSync(join(dir, 'photos', saved.id))).toBe(false);
    secondDb.close();
  });

  it('refuses ids that could escape the photo folder', () => {
    const dir = tempDir();
    const db = createSqlitePersistence(join(dir, 'hotel.db'));
    const store = createPhotoStore(clock(), { dir, persistence: db });
    expect(store.get('../hotel.db')).toBeUndefined();
    db.close();
  });
});

describe('storage settings', () => {
  it('uses a SQLite file under the data folder by default, or memory when asked', () => {
    expect(hotelStorage({}, '/srv/app')).toEqual({ kind: 'sqlite', file: join('/srv/app', 'data', 'hotel.db'), photosDir: join('/srv/app', 'data', 'photos') });
    expect(hotelStorage({ HOTEL_DATA_DIR: '/var/hotel' }, '/srv/app')).toEqual({ kind: 'sqlite', file: join('/var/hotel', 'hotel.db'), photosDir: join('/var/hotel', 'photos') });
    expect(hotelStorage({ HOTEL_STORAGE: 'memory' }, '/srv/app')).toEqual({ kind: 'memory' });
  });
});
