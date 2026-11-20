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
}

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
    list: ({ entityType, entityId, limit }: AuditFilter = {}): AuditEntry[] => {
      const matching = entries
        .filter((e) => (!entityType || e.entityType === entityType) && (!entityId || e.entityId === entityId))
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
