import { describe, it, expect, beforeEach } from 'vitest';
import { createRecordRepository } from '../../src/server/recordRepository';
import type { RecordInput } from '../../src/server/types';

const seed: RecordInput[] = [
  { name: 'Alpha Project', owner: 'alice', status: 'active', amount: 100 },
  { name: 'Beta Launch', owner: 'bob', status: 'inactive', amount: 250 },
  { name: 'Gamma Audit', owner: 'alice', status: 'pending', amount: 75 },
];

describe('recordRepository', () => {
  let repo: ReturnType<typeof createRecordRepository>;
  beforeEach(() => {
    repo = createRecordRepository(seed);
  });

  it('lists all seeded records with generated ids', () => {
    const all = repo.list();
    expect(all).toHaveLength(3);
    expect(all.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('filters by case-insensitive text across name and owner', () => {
    expect(repo.list({ text: 'ALICE' }).map((r) => r.name)).toEqual(['Alpha Project', 'Gamma Audit']);
    expect(repo.list({ text: 'launch' }).map((r) => r.name)).toEqual(['Beta Launch']);
  });

  it('filters by status', () => {
    expect(repo.list({ status: 'pending' }).map((r) => r.name)).toEqual(['Gamma Audit']);
  });

  it('gets a record by id or returns undefined', () => {
    expect(repo.get('2')?.name).toBe('Beta Launch');
    expect(repo.get('99')).toBeUndefined();
  });

  it('creates a record with a new id', () => {
    const created = repo.create({ name: 'Delta', owner: 'dan', status: 'active', amount: 10 });
    expect(created.id).toBe('4');
    expect(repo.list()).toHaveLength(4);
  });

  it('updates a record partially', () => {
    const updated = repo.update('1', { status: 'inactive' });
    expect(updated).toMatchObject({ id: '1', name: 'Alpha Project', status: 'inactive' });
    expect(repo.update('99', { status: 'inactive' })).toBeUndefined();
  });

  it('removes a record', () => {
    expect(repo.remove('1')).toBe(true);
    expect(repo.remove('1')).toBe(false);
    expect(repo.list()).toHaveLength(2);
  });

  it('resets back to the seed', () => {
    repo.remove('1');
    repo.create({ name: 'X', owner: 'x', status: 'active', amount: 1 });
    repo.reset();
    expect(repo.list().map((r) => r.id)).toEqual(['1', '2', '3']);
  });
});
