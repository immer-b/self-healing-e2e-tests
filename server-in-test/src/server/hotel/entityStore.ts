import type { Actor, AuditLog, FieldChange } from './auditLog';
import type { Clock } from './clock';
import { memoryPersistence, type Persistence } from './persistence';

export interface EntityMeta {
  id: string;
  createdAt: string;
  createdBy: Actor;
  updatedAt: string;
  updatedBy: Actor;
  /** Soft delete: entities are never physically removed, so history (customers, pets, staff) is kept. */
  deletedAt: string | null;
  deletedBy: Actor | null;
}

export type Entity<T> = T & EntityMeta;

export interface ListOptions<T> {
  includeDeleted?: boolean;
  where?: (entity: Entity<T>) => boolean;
}

const META_FIELDS = new Set<string>(['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deletedAt', 'deletedBy']);
const SECRET = '•••';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * In-memory store for one entity type with soft delete and an automatic audit trail.
 * Every write takes the acting user so the change log can say who did what and when.
 */
export function createEntityStore<T extends object>(options: {
  entityType: string;
  idPrefix: string;
  audit: AuditLog;
  clock: Clock;
  /** Fields whose values are masked in the change log (for example password hashes). */
  secretFields?: readonly string[];
  /** Where entities are written through to. In memory only by default. */
  persistence?: Persistence;
}) {
  const { entityType, idPrefix, audit, clock, secretFields = [], persistence = memoryPersistence() } = options;
  let items: Entity<T>[] = persistence.loadAll<Entity<T>>(entityType);
  let nextId = items.reduce((max, item) => Math.max(max, Number(item.id.split('-').pop()) || 0), 0) + 1;
  const save = (entity: Entity<T>) => persistence.put(entityType, entity.id, entity);

  const mask = (field: string, value: unknown) =>
    value === null || value === undefined ? null : secretFields.includes(field) ? SECRET : value;

  const diff = (before: Partial<T>, after: Partial<T>): FieldChange[] => {
    const fields = new Set([...Object.keys(before), ...Object.keys(after)].filter((f) => !META_FIELDS.has(f)));
    return [...fields]
      .filter((field) => !same(before[field as keyof T], after[field as keyof T]))
      .map((field) => ({
        field,
        from: mask(field, before[field as keyof T]),
        to: mask(field, after[field as keyof T]),
      }));
  };

  const log = (entityId: string, action: string, actor: Actor, changes: FieldChange[]) =>
    audit.record({ entityType, entityId, action, actor, changes });

  const find = (id: string) => items.findIndex((item) => item.id === id);
  const copy = <V>(value: V): V => structuredClone(value);
  const stripMeta = (patch: Partial<T>) =>
    Object.fromEntries(Object.entries(patch).filter(([k, v]) => !META_FIELDS.has(k) && v !== undefined)) as Partial<T>;

  const stamp = (index: number, changes: Partial<EntityMeta>) => {
    items[index] = { ...items[index], ...changes };
    save(items[index]);
    return copy(items[index]);
  };

  return {
    entityType,

    create: (input: T, actor: Actor): Entity<T> => {
      const at = clock.now().toISOString();
      const data = copy(stripMeta(input));
      const entity = {
        ...data,
        id: `${idPrefix}-${nextId++}`,
        createdAt: at,
        createdBy: actor,
        updatedAt: at,
        updatedBy: actor,
        deletedAt: null,
        deletedBy: null,
      } as Entity<T>;
      items.push(entity);
      save(entity);
      log(entity.id, 'create', actor, diff({}, data));
      return copy(entity);
    },

    get: (id: string): Entity<T> | undefined => {
      const index = find(id);
      return index < 0 ? undefined : copy(items[index]);
    },

    list: ({ includeDeleted = false, where }: ListOptions<T> = {}): Entity<T>[] =>
      items.filter((item) => (includeDeleted || !item.deletedAt) && (!where || where(item))).map(copy),

    update: (id: string, patch: Partial<T>, actor: Actor, action = 'update'): Entity<T> | undefined => {
      const index = find(id);
      if (index < 0 || items[index].deletedAt) return undefined;
      const before = items[index];
      const after = { ...before, ...copy(stripMeta(patch)) };
      const changes = diff(before as Partial<T>, after as Partial<T>);
      if (!changes.length) return copy(before);
      items[index] = { ...after, updatedAt: clock.now().toISOString(), updatedBy: actor };
      save(items[index]);
      log(id, action, actor, changes);
      return copy(items[index]);
    },

    remove: (id: string, actor: Actor): Entity<T> | undefined => {
      const index = find(id);
      if (index < 0 || items[index].deletedAt) return undefined;
      log(id, 'delete', actor, []);
      return stamp(index, { deletedAt: clock.now().toISOString(), deletedBy: actor });
    },

    restore: (id: string, actor: Actor): Entity<T> | undefined => {
      const index = find(id);
      if (index < 0) return undefined;
      if (items[index].deletedAt) log(id, 'restore', actor, []);
      return stamp(index, { deletedAt: null, deletedBy: null });
    },

    reset: () => {
      items = [];
      nextId = 1;
      persistence.clear(entityType);
    },
  };
}

export type EntityStore<T extends object> = ReturnType<typeof createEntityStore<T>>;
