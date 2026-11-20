import { describe, expect, it } from 'vitest';
import { assignEvenly, careSlotsFor, planCareTasks, workload } from '../../../src/server/hotel/scheduling';

const stay = (id: string, petId: string, checkIn: string, checkOut: string, status = 'checked_in') =>
  ({ id, petId, roomId: `room-${petId}`, checkIn, checkOut, status }) as const;

describe('careSlotsFor', () => {
  const s = stay('s1', 'p1', '2026-11-20', '2026-11-23');

  it('has only an evening round on arrival day', () => {
    expect(careSlotsFor(s, '2026-11-20')).toEqual(['evening']);
  });

  it('has morning and evening rounds on full days', () => {
    expect(careSlotsFor(s, '2026-11-21')).toEqual(['morning', 'evening']);
  });

  it('has only a morning round on departure day', () => {
    expect(careSlotsFor(s, '2026-11-23')).toEqual(['morning']);
  });

  it('has no rounds outside the stay', () => {
    expect(careSlotsFor(s, '2026-11-19')).toEqual([]);
    expect(careSlotsFor(s, '2026-11-24')).toEqual([]);
  });
});

describe('planCareTasks', () => {
  it('plans rounds for booked and checked-in stays but not cancelled or checked-out ones', () => {
    const planned = planCareTasks('2026-11-21', [
      stay('s1', 'p1', '2026-11-20', '2026-11-23'),
      stay('s2', 'p2', '2026-11-21', '2026-11-22', 'booked'),
      stay('s3', 'p3', '2026-11-20', '2026-11-25', 'cancelled'),
      stay('s4', 'p4', '2026-11-19', '2026-11-21', 'checked_out'),
    ], []);
    expect(planned).toEqual([
      { date: '2026-11-21', slot: 'morning', petId: 'p1', stayId: 's1', roomId: 'room-p1' },
      { date: '2026-11-21', slot: 'evening', petId: 'p1', stayId: 's1', roomId: 'room-p1' },
      { date: '2026-11-21', slot: 'evening', petId: 'p2', stayId: 's2', roomId: 'room-p2' },
    ]);
  });

  it('skips rounds that already exist so generating twice never duplicates', () => {
    const planned = planCareTasks('2026-11-21', [stay('s1', 'p1', '2026-11-20', '2026-11-23')], [
      { stayId: 's1', slot: 'morning', date: '2026-11-21' },
    ]);
    expect(planned.map((t) => t.slot)).toEqual(['evening']);
  });
});

describe('assignEvenly', () => {
  const tasks = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ key: `t${i}`, petId: `p${Math.floor(i / 2)}`, assigneeId: null as string | null }));

  it('spreads tasks so no one has more than one task more than anyone else', () => {
    const result = assignEvenly(tasks(11), ['a', 'b', 'c'], []);
    const counts = workload(result.map((r) => r.assigneeId));
    expect(Object.values(counts).sort()).toEqual([3, 4, 4]);
  });

  it('accounts for work people already have that day', () => {
    const result = assignEvenly(tasks(4), ['a', 'b', 'c'], ['a', 'a', 'a', 'b']);
    const counts = workload(['a', 'a', 'a', 'b', ...result.map((r) => r.assigneeId)]);
    expect(counts).toEqual({ a: 3, b: 3, c: 2 });
  });

  it('prefers keeping both rounds of the same pet with the same person when loads tie', () => {
    const result = assignEvenly(tasks(4), ['a', 'b'], []);
    const assigneesOf = (petId: string) => new Set(result.filter((r) => r.petId === petId).map((r) => r.assigneeId));
    expect(assigneesOf('p0').size).toBe(1);
    expect(assigneesOf('p1').size).toBe(1);
    expect(assigneesOf('p0')).not.toEqual(assigneesOf('p1'));
  });

  it('keeps a task with its current assignee when that is still balanced (no needless churn)', () => {
    const result = assignEvenly(
      [
        { key: 't1', petId: 'p1', assigneeId: 'b' },
        { key: 't2', petId: 'p2', assigneeId: 'a' },
      ],
      ['a', 'b'],
      [],
    );
    expect(result).toEqual([
      { key: 't1', petId: 'p1', assigneeId: 'b' },
      { key: 't2', petId: 'p2', assigneeId: 'a' },
    ]);
  });

  it('moves work off someone no longer on shift', () => {
    const result = assignEvenly(
      [
        { key: 't1', petId: 'p1', assigneeId: 'gone' },
        { key: 't2', petId: 'p2', assigneeId: 'gone' },
      ],
      ['a', 'b'],
      [],
    );
    expect(result.map((r) => r.assigneeId).sort()).toEqual(['a', 'b']);
  });

  it('leaves tasks unassigned when nobody is available', () => {
    expect(assignEvenly(tasks(2), [], []).map((r) => r.assigneeId)).toEqual([null, null]);
  });

  it('is deterministic', () => {
    expect(assignEvenly(tasks(7), ['a', 'b', 'c'], [])).toEqual(assignEvenly(tasks(7), ['a', 'b', 'c'], []));
  });
});
