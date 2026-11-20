import { CARE_SLOTS, type CareSlot, type IsoDate, type StayRecord } from './types';

/**
 * Care scheduling, kept as pure functions so the rules are easy to test and to replace with a
 * constraint solver later (see the "Scheduling" section of server-in-test/README.md).
 */

type StayLike = Pick<StayRecord, 'petId' | 'roomId' | 'checkIn' | 'checkOut' | 'status'> & { id: string };

const ACTIVE_STAY = new Set(['booked', 'checked_in']);

/** Arrival day gets the evening round, departure day the morning round, full days both. */
export function careSlotsFor(stay: Pick<StayLike, 'checkIn' | 'checkOut'>, date: IsoDate): CareSlot[] {
  if (date < stay.checkIn || date > stay.checkOut) return [];
  return CARE_SLOTS.filter(
    (slot) => !(slot === 'morning' && date === stay.checkIn) && !(slot === 'evening' && date === stay.checkOut),
  );
}

export interface PlannedTask {
  date: IsoDate;
  slot: CareSlot;
  petId: string;
  stayId: string;
  roomId: string;
}

/** Care rounds needed on `date` that do not exist yet, so generating twice never duplicates work. */
export function planCareTasks(
  date: IsoDate,
  stays: readonly StayLike[],
  existing: readonly { stayId: string; slot: CareSlot; date: IsoDate }[],
): PlannedTask[] {
  const exists = new Set(existing.filter((t) => t.date === date).map((t) => `${t.stayId}:${t.slot}`));
  return stays
    .filter((stay) => ACTIVE_STAY.has(stay.status))
    .flatMap((stay) =>
      careSlotsFor(stay, date).map((slot) => ({ date, slot, petId: stay.petId, stayId: stay.id, roomId: stay.roomId })),
    )
    .filter((task) => !exists.has(`${task.stayId}:${task.slot}`));
}

/** Slot start times, in minutes after midnight (hotel time). */
export const SLOT_MINUTES: Record<CareSlot, number> = { morning: 8 * 60, evening: 17 * 60 };
/** How long after its slot time a round may stay open before it counts as overdue. */
export const OVERDUE_GRACE_MINUTES = 120;

/** A pending round from an earlier day, or more than the grace period past its slot time today. */
export function isOverdue(task: { date: IsoDate; slot: CareSlot; status: string }, today: IsoDate, minutesIntoDay: number) {
  if (task.status !== 'pending') return false;
  if (task.date < today) return true;
  return task.date === today && minutesIntoDay > SLOT_MINUTES[task.slot] + OVERDUE_GRACE_MINUTES;
}

/** Count of tasks per assignee, ignoring unassigned ones. */
export function workload(assigneeIds: readonly (string | null)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of assigneeIds) if (id) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

export interface Assignable {
  key: string;
  petId: string;
  assigneeId: string | null;
}

/**
 * Distributes `tasks` across `staffIds` as evenly as possible, given each person's `fixedLoad`
 * (assignee ids of work they already have that day and that is not being redistributed).
 *
 * 1. Water-fill: hand out task *counts* one at a time to whoever has the least total work. This
 *    guarantees the most even split achievable.
 * 2. Fill those quotas with actual tasks: keep a task with its current assignee when they still have
 *    quota (no needless churn), then keep a pet's rounds with one person, then give the rest to whoever
 *    has the most quota left. Ties go to the order of `staffIds`, so the result is deterministic.
 */
export function assignEvenly<T extends Assignable>(
  tasks: readonly T[],
  staffIds: readonly string[],
  fixedLoad: readonly (string | null)[],
): T[] {
  if (!staffIds.length) return tasks.map((t) => ({ ...t, assigneeId: null }));

  const load = workload(fixedLoad);
  const quota = new Map(staffIds.map((id) => [id, 0]));
  const total = (id: string) => (load[id] ?? 0) + quota.get(id)!;
  for (let i = 0; i < tasks.length; i++) {
    const next = staffIds.reduce((best, id) => (total(id) < total(best) ? id : best));
    quota.set(next, quota.get(next)! + 1);
  }

  const result = tasks.map((t) => ({ ...t, assigneeId: null as string | null }));
  const petOwner = new Map<string, string>();
  const give = (index: number, id: string) => {
    result[index].assigneeId = id;
    quota.set(id, quota.get(id)! - 1);
    if (!petOwner.has(result[index].petId)) petOwner.set(result[index].petId, id);
  };

  tasks.forEach((task, i) => {
    if (task.assigneeId && (quota.get(task.assigneeId) ?? 0) > 0) give(i, task.assigneeId);
  });

  result.forEach((task, i) => {
    if (task.assigneeId) return;
    const sameCarer = petOwner.get(task.petId);
    if (sameCarer && quota.get(sameCarer)! > 0) return give(i, sameCarer);
    give(i, staffIds.reduce((best, id) => (quota.get(id)! > quota.get(best)! ? id : best)));
  });

  return result as T[];
}
