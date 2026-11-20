import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Where the hotel's stores write their documents. The stores keep their working copy in memory
 * and write through on every change, so reads never touch the disk.
 */
export interface Persistence {
  /** Every document of a collection, in the order it was first stored. */
  loadAll<T>(collection: string): T[];
  put(collection: string, id: string, document: unknown): void;
  clear(collection: string): void;
  /** Runs `fn` as one atomic write (used by reset so the seed lands all at once). */
  transaction(fn: () => void): void;
  close(): void;
}

/** No-op persistence: data lives only in the stores' memory (tests, demos). */
export const memoryPersistence = (): Persistence => ({
  loadAll: () => [],
  put: () => {},
  clear: () => {},
  transaction: (fn) => fn(),
  close: () => {},
});

/** One SQLite file holding a JSON document per entity, keyed by collection and id. */
export function createSqlitePersistence(file: string): Persistence {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS documents (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
  `);
  const select = db.prepare('SELECT data FROM documents WHERE collection = ? ORDER BY seq');
  const upsert = db.prepare(`
    INSERT INTO documents (collection, id, seq, data)
    VALUES (?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM documents WHERE collection = ?), ?)
    ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data
  `);
  const remove = db.prepare('DELETE FROM documents WHERE collection = ?');
  let depth = 0;

  return {
    loadAll: <T>(collection: string) => select.all(collection).map((row) => JSON.parse(String(row.data)) as T),
    put: (collection, id, document) => {
      upsert.run(collection, id, collection, JSON.stringify(document));
    },
    clear: (collection) => {
      remove.run(collection);
    },
    transaction: (fn) => {
      if (depth++ === 0) db.exec('BEGIN');
      try {
        fn();
        if (depth === 1) db.exec('COMMIT');
      } catch (error) {
        if (depth === 1) db.exec('ROLLBACK');
        throw error;
      } finally {
        depth--;
      }
    },
    close: () => db.close(),
  };
}
