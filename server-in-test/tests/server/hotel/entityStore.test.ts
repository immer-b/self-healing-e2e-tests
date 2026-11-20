import { describe, expect, it } from 'vitest';
import { addDays, createClock, isIsoDate } from '../../../src/server/hotel/clock';
import { createAuditLog } from '../../../src/server/hotel/auditLog';
import { createEntityStore } from '../../../src/server/hotel/entityStore';

const admin = { id: 'emp-1', name: 'Morgan Reyes' };
const desk = { id: 'emp-2', name: 'Priya Shah' };

interface Thing {
  name: string;
  size: number;
  tags?: string[];
}

function setup() {
  const clock = createClock(new Date('2026-11-20T09:30:00'));
  const audit = createAuditLog(clock);
  const store = createEntityStore<Thing>({ entityType: 'thing', idPrefix: 'thg', audit, clock });
  return { clock, audit, store };
}

describe('clock', () => {
  it('reports the local calendar date of a fixed instant', () => {
    expect(createClock(new Date('2026-11-20T23:59:00')).today()).toBe('2026-11-20');
  });

  it('can be moved for tests', () => {
    const clock = createClock(new Date('2026-11-20T10:00:00'));
    clock.set(new Date('2027-01-02T08:00:00'));
    expect(clock.today()).toBe('2027-01-02');
    expect(clock.now().toISOString()).toBe(new Date('2027-01-02T08:00:00').toISOString());
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('recognises valid ISO calendar dates only', () => {
    expect(isIsoDate('2026-11-20')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('20-11-2026')).toBe(false);
    expect(isIsoDate(20261120)).toBe(false);
  });
});

describe('entity store', () => {
  it('creates entities with prefixed ids and creation metadata', () => {
    const { store } = setup();
    const a = store.create({ name: 'Alpha', size: 1 }, admin);
    const b = store.create({ name: 'Beta', size: 2 }, admin);
    expect(a).toMatchObject({ id: 'thg-1', name: 'Alpha', size: 1, createdBy: admin, deletedAt: null });
    expect(a.createdAt).toBe(new Date('2026-11-20T09:30:00').toISOString());
    expect(b.id).toBe('thg-2');
  });

  it('returns copies so callers cannot mutate stored state', () => {
    const { store } = setup();
    const created = store.create({ name: 'Alpha', size: 1, tags: ['x'] }, admin);
    created.name = 'Hacked';
    created.tags!.push('y');
    expect(store.get(created.id)).toMatchObject({ name: 'Alpha', tags: ['x'] });
  });

  it('updates fields, keeps the id and stamps who changed it', () => {
    const { store, clock } = setup();
    const { id } = store.create({ name: 'Alpha', size: 1 }, admin);
    clock.set(new Date('2026-11-21T11:00:00'));
    const updated = store.update(id, { size: 5, id: 'other' } as Partial<Thing>, desk);
    expect(updated).toMatchObject({ id, name: 'Alpha', size: 5, updatedBy: desk });
    expect(updated!.updatedAt).toBe(new Date('2026-11-21T11:00:00').toISOString());
  });

  it('soft deletes: hidden from list by default but still retrievable', () => {
    const { store } = setup();
    const { id } = store.create({ name: 'Alpha', size: 1 }, admin);
    store.create({ name: 'Beta', size: 2 }, admin);
    const removed = store.remove(id, desk);
    expect(removed).toMatchObject({ id, deletedBy: desk });
    expect(removed!.deletedAt).toBeTruthy();
    expect(store.list().map((t) => t.name)).toEqual(['Beta']);
    expect(store.list({ includeDeleted: true }).map((t) => t.name)).toEqual(['Alpha', 'Beta']);
    expect(store.get(id)).toMatchObject({ name: 'Alpha' });
  });

  it('refuses to update or re-delete a deleted entity, but can restore it', () => {
    const { store } = setup();
    const { id } = store.create({ name: 'Alpha', size: 1 }, admin);
    store.remove(id, admin);
    expect(store.update(id, { size: 9 }, admin)).toBeUndefined();
    expect(store.remove(id, admin)).toBeUndefined();
    expect(store.restore(id, admin)).toMatchObject({ id, deletedAt: null, deletedBy: null });
    expect(store.list()).toHaveLength(1);
  });

  it('returns undefined for unknown ids', () => {
    const { store } = setup();
    expect(store.get('nope')).toBeUndefined();
    expect(store.update('nope', { size: 1 }, admin)).toBeUndefined();
    expect(store.remove('nope', admin)).toBeUndefined();
    expect(store.restore('nope', admin)).toBeUndefined();
  });

  it('filters with a predicate', () => {
    const { store } = setup();
    store.create({ name: 'Alpha', size: 1 }, admin);
    store.create({ name: 'Beta', size: 2 }, admin);
    expect(store.list({ where: (t) => t.size > 1 }).map((t) => t.name)).toEqual(['Beta']);
  });

  it('resets to an empty store with ids starting again', () => {
    const { store, audit } = setup();
    store.create({ name: 'Alpha', size: 1 }, admin);
    store.reset();
    audit.reset();
    expect(store.list({ includeDeleted: true })).toEqual([]);
    expect(store.create({ name: 'Beta', size: 2 }, admin).id).toBe('thg-1');
  });
});

describe('audit log', () => {
  it('records create, update, delete and restore with actor, time and field changes', () => {
    const { store, audit, clock } = setup();
    const { id } = store.create({ name: 'Alpha', size: 1 }, admin);
    clock.set(new Date('2026-11-21T08:00:00'));
    store.update(id, { size: 3 }, desk);
    store.remove(id, desk);
    store.restore(id, admin);

    const entries = audit.list({ entityType: 'thing', entityId: id });
    expect(entries.map((e) => e.action)).toEqual(['restore', 'delete', 'update', 'create']); // newest first
    const create = entries[3];
    expect(create).toMatchObject({ entityType: 'thing', entityId: id, actor: admin });
    expect(create.changes).toEqual([
      { field: 'name', from: null, to: 'Alpha' },
      { field: 'size', from: null, to: 1 },
    ]);
    expect(entries[2]).toMatchObject({ actor: desk, changes: [{ field: 'size', from: 1, to: 3 }] });
    expect(entries[2].at).toBe(new Date('2026-11-21T08:00:00').toISOString());
  });

  it('skips updates that change nothing and ignores metadata fields in diffs', () => {
    const { store, audit } = setup();
    const { id } = store.create({ name: 'Alpha', size: 1, tags: ['a'] }, admin);
    store.update(id, { size: 1, tags: ['a'] }, desk);
    expect(audit.list({ entityId: id }).map((e) => e.action)).toEqual(['create']);
  });

  it('diffs nested values by content', () => {
    const { store, audit } = setup();
    const { id } = store.create({ name: 'Alpha', size: 1, tags: ['a'] }, admin);
    store.update(id, { tags: ['a', 'b'] }, desk);
    expect(audit.list({ entityId: id })[0].changes).toEqual([{ field: 'tags', from: ['a'], to: ['a', 'b'] }]);
  });

  it('hides fields marked secret', () => {
    const clock = createClock(new Date('2026-11-20T09:30:00'));
    const audit = createAuditLog(clock);
    const users = createEntityStore<{ name: string; passwordHash: string }>({
      entityType: 'user',
      idPrefix: 'usr',
      audit,
      clock,
      secretFields: ['passwordHash'],
    });
    const { id } = users.create({ name: 'A', passwordHash: 'h1' }, admin);
    users.update(id, { passwordHash: 'h2' }, admin);
    const [update, create] = audit.list({ entityId: id });
    expect(create.changes).toContainEqual({ field: 'passwordHash', from: null, to: '•••' });
    expect(update.changes).toEqual([{ field: 'passwordHash', from: '•••', to: '•••' }]);
  });

  it('filters by entity type and supports a limit', () => {
    const { store, audit } = setup();
    store.create({ name: 'Alpha', size: 1 }, admin);
    store.create({ name: 'Beta', size: 2 }, admin);
    audit.record({ entityType: 'other', entityId: 'x', action: 'create', actor: admin, changes: [] });
    expect(audit.list({ entityType: 'thing' })).toHaveLength(2);
    expect(audit.list({ limit: 1 })).toHaveLength(1);
    expect(audit.list()[0].entityType).toBe('other');
  });
});
