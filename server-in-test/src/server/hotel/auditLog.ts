import type { Clock } from './clock';

/** Who performed an action. Stored by value so the log survives renames and deletions. */
export interface Actor {
  id: string;
  name: string;
}

export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | (string & {});

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  actor: Actor;
  at: string;
  changes: FieldChange[];
}

export interface AuditFilter {
  entityType?: string;
  entityId?: string;
  limit?: number;
  /** Cursor: only entries older than this entry id (paging backwards from the newest). */
  before?: string;
  /** Inclusive hotel-calendar date range. */
  from?: string;
  to?: string;
}

const sequence = (id: string) => Number(id.replace(/^aud-/, ''));

/** Append-only change log. Entries are never edited or removed (except by a full test reset). */
export function createAuditLog(clock: Clock) {
  let entries: AuditEntry[] = [];
  let nextId = 1;

  return {
    record: (entry: Omit<AuditEntry, 'id' | 'at'>): AuditEntry => {
      const stored = structuredClone({ ...entry, id: `aud-${nextId++}`, at: clock.now().toISOString() });
      entries.push(stored);
      return structuredClone(stored);
    },
    list: ({ entityType, entityId, limit, before, from, to }: AuditFilter = {}): AuditEntry[] => {
      const cursor = before ? sequence(before) : Infinity;
      const matching = entries
        .filter((e) => {
          if (entityType && e.entityType !== entityType) return false;
          if (entityId && e.entityId !== entityId) return false;
          if (sequence(e.id) >= cursor) return false;
          const day = from || to ? clock.dateOf(e.at) : '';
          return (!from || day >= from) && (!to || day <= to);
        })
        .reverse();
      return structuredClone(limit ? matching.slice(0, limit) : matching);
    },
    reset: () => {
      entries = [];
      nextId = 1;
    },
  };
}

export type AuditLog = ReturnType<typeof createAuditLog>;
