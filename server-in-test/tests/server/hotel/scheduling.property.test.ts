import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { assignEvenly, careSlotsFor, workload } from '../../../src/server/hotel/scheduling';

const staffArb = fc.uniqueArray(fc.constantFrom<string>('a', 'b', 'c', 'd', 'e', 'f'), { minLength: 1, maxLength: 6 });

/** Tasks (some already assigned, possibly to people no longer on shift) plus the staff on shift. */
const scenario = staffArb.chain((staff) =>
  fc.record({
    staff: fc.constant(staff),
    tasks: fc.array(
      fc.record({
        petId: fc.constantFrom('p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'),
        assigneeId: fc.option(fc.constantFrom(...staff, 'gone'), { nil: null }),
      }),
      { maxLength: 40 },
    ),
    fixed: fc.array(fc.option(fc.constantFrom(...staff), { nil: null }), { maxLength: 10 }),
  }),
);

const withKeys = <T>(tasks: T[]) => tasks.map((t, i) => ({ ...t, key: `t${i}` }));

describe('assignEvenly (properties)', () => {
  it('assigns every task exactly once, to someone on shift', () => {
    fc.assert(
      fc.property(scenario, ({ staff, tasks, fixed }) => {
        const result = assignEvenly(withKeys(tasks), staff, fixed);
        expect(result.map((r) => r.key)).toEqual(withKeys(tasks).map((t) => t.key));
        expect(result.every((r) => r.assigneeId !== null && staff.includes(r.assigneeId))).toBe(true);
        expect(result.map((r) => r.petId)).toEqual(tasks.map((t) => t.petId));
      }),
    );
  });

  it('never leaves anyone more than one round ahead, unless their existing work already put them there', () => {
    fc.assert(
      fc.property(scenario, ({ staff, tasks, fixed }) => {
        const result = assignEvenly(withKeys(tasks), staff, fixed);
        const total = workload([...fixed, ...result.map((r) => r.assigneeId)]);
        const fixedLoad = workload(fixed);
        const loads = staff.map((id) => total[id] ?? 0);
        const min = Math.min(...loads);
        for (const id of staff) {
          const load = total[id] ?? 0;
          const gotNew = load > (fixedLoad[id] ?? 0);
          // anyone who received new work is at most one above the least-loaded person
          if (gotNew) expect(load - min).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it('splits work perfectly evenly when nobody starts with any', () => {
    fc.assert(
      fc.property(scenario, ({ staff, tasks }) => {
        const loads = staff.map((id) => workload(assignEvenly(withKeys(tasks), staff, []).map((r) => r.assigneeId))[id] ?? 0);
        expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(scenario, ({ staff, tasks, fixed }) => {
        expect(assignEvenly(withKeys(tasks), staff, fixed)).toEqual(assignEvenly(withKeys(tasks), staff, fixed));
      }),
    );
  });

  it('does not move a task that is already with someone on shift when the split is already even', () => {
    fc.assert(
      fc.property(staffArb, fc.integer({ min: 0, max: 5 }), (staff, perPerson) => {
        const tasks = withKeys(staff.flatMap((id, s) => Array.from({ length: perPerson }, (_, i) => ({ petId: `p${s}-${i}`, assigneeId: id as string | null }))));
        expect(assignEvenly(tasks, staff, [])).toEqual(tasks);
      }),
    );
  });
});

describe('careSlotsFor (properties)', () => {
  const day = fc.integer({ min: 1, max: 28 }).map((d) => `2026-11-${String(d).padStart(2, '0')}`);

  it('gives 2 rounds per full night-pair: a stay of n nights has 2n rounds in total', () => {
    fc.assert(
      fc.property(day, day, (a, b) => {
        fc.pre(a < b);
        const nights = Number(b.slice(-2)) - Number(a.slice(-2));
        let total = 0;
        for (let d = Number(a.slice(-2)); d <= Number(b.slice(-2)); d++) {
          total += careSlotsFor({ checkIn: a, checkOut: b }, `2026-11-${String(d).padStart(2, '0')}`).length;
        }
        expect(total).toBe(2 * nights);
      }),
    );
  });
});
