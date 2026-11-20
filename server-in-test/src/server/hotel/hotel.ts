import { createAuditLog, type Actor } from './auditLog';
import { addDays, isIsoDate, type Clock } from './clock';
import { createEntityStore, type Entity, type EntityStore } from './entityStore';
import { conflict, fromValidation, invalid, notFound, success, type Outcome } from './outcome';
import { hashPassword, verifyPassword } from './passwords';
import { createPhotoStore } from './photos';
import { assignEvenly, isOverdue, planCareTasks } from './scheduling';
import { seedHotel } from './seed';
import { createSessionStore } from './sessions';
import { createLoginThrottle } from './loginThrottle';
import {
  CARE_SLOTS,
  type Employee,
  type EmployeeInput,
  type EmployeeRecord,
  type IsoDate,
  type NoteRecord,
  type OwnerInput,
  type PetInput,
  type RoomInput,
  type StayInput,
  type StayRecord,
  type StayStatus,
  type Task,
  type TaskRecord,
} from './types';
import { validateEmployee, validateNote, validateOwner, validatePassword, validatePet, validateRoom, validateStay } from './validation';

const ACTIVE_STAY: readonly StayStatus[] = ['booked', 'checked_in'];
const includes = (haystack: (string | undefined)[], needle?: string) => {
  const n = needle?.trim().toLowerCase();
  return !n || haystack.some((h) => h?.toLowerCase().includes(n));
};
const overlaps = (a: StayInput, b: StayInput) => a.checkIn < b.checkOut && b.checkIn < a.checkOut;
const slotOrder = (slot: string) => CARE_SLOTS.indexOf(slot as (typeof CARE_SLOTS)[number]);

export interface ListFilter {
  text?: string;
  includeDeleted?: boolean;
}

/**
 * The pet hotel domain: staff accounts, rooms, owners, pets, stays, legal notes and care tasks.
 * Everything is in memory and seeded relative to the clock's "today". All writes are attributed
 * to an actor and land in the audit log; nothing is ever physically deleted.
 */
export function createHotel({ clock, seed = true }: { clock: Clock; seed?: boolean }) {
  const audit = createAuditLog(clock);
  const photos = createPhotoStore(clock);
  const sessions = createSessionStore(clock);
  const loginThrottle = createLoginThrottle(clock);
  const store = {
    employees: createEntityStore<EmployeeRecord>({ entityType: 'employee', idPrefix: 'emp', audit, clock, secretFields: ['passwordHash'] }),
    rooms: createEntityStore<RoomInput>({ entityType: 'room', idPrefix: 'room', audit, clock }),
    owners: createEntityStore<OwnerInput>({ entityType: 'owner', idPrefix: 'own', audit, clock }),
    pets: createEntityStore<PetInput>({ entityType: 'pet', idPrefix: 'pet', audit, clock }),
    stays: createEntityStore<StayRecord>({ entityType: 'stay', idPrefix: 'stay', audit, clock }),
    notes: createEntityStore<NoteRecord>({ entityType: 'note', idPrefix: 'note', audit, clock }),
    tasks: createEntityStore<TaskRecord>({ entityType: 'task', idPrefix: 'task', audit, clock }),
  };

  const isActive = <T>(entity: Entity<T> | undefined): entity is Entity<T> => !!entity && !entity.deletedAt;

  /* ---------------- employees ---------------- */

  const publicEmployee = ({ passwordHash: _hash, ...rest }: Entity<EmployeeRecord>): Employee => rest;
  const activeAdmins = () => store.employees.list({ where: (e) => e.role === 'admin' });
  const usernameTaken = (username: string, exceptId?: string) =>
    store.employees.list({ includeDeleted: true }).some((e) => e.username === username && e.id !== exceptId);
  const isActiveStaff = (id: string) => store.employees.list({ where: (e) => e.id === id && e.role === 'staff' }).length > 0;

  const employees = {
    list: ({ text, includeDeleted }: ListFilter = {}) =>
      store.employees
        .list({ includeDeleted, where: (e) => includes([e.name, e.username, e.email], text) })
        .map(publicEmployee),
    get: (id: string) => {
      const found = store.employees.get(id);
      return found && publicEmployee(found);
    },
    create: (input: EmployeeInput & { password?: string }, actor: Actor): Outcome<Employee> => {
      const result = validateEmployee(input);
      const passwordError = validatePassword(input?.password);
      if (!result.ok || passwordError) {
        return invalid({ ...(result.ok ? {} : result.errors), ...(passwordError ? { password: passwordError } : {}) });
      }
      if (usernameTaken(result.value.username)) return invalid({ username: 'is already taken' }, 409);
      const created = store.employees.create({ ...result.value, passwordHash: hashPassword(input.password!) }, actor);
      return success(publicEmployee(created));
    },
    update: (id: string, patch: Partial<EmployeeInput> & { password?: string }, actor: Actor): Outcome<Employee> => {
      const existing = store.employees.get(id);
      if (!isActive(existing)) return notFound('Employee');
      const result = validateEmployee(patch, { partial: true });
      const passwordError = patch?.password !== undefined ? validatePassword(patch.password) : undefined;
      if (!result.ok || passwordError) {
        return invalid({ ...(result.ok ? {} : result.errors), ...(passwordError ? { password: passwordError } : {}) });
      }
      const changes: Partial<EmployeeRecord> = { ...result.value };
      if (changes.username && usernameTaken(changes.username, id)) return invalid({ username: 'is already taken' }, 409);
      if (existing.role === 'admin' && changes.role && changes.role !== 'admin' && activeAdmins().length <= 1) {
        return conflict('At least one admin is required');
      }
      if (patch.password !== undefined) changes.passwordHash = hashPassword(patch.password);
      return success(publicEmployee(store.employees.update(id, changes, actor)!));
    },
    remove: (id: string, actor: Actor): Outcome<Employee> => {
      const existing = store.employees.get(id);
      if (!isActive(existing)) return notFound('Employee');
      if (id === actor.id) return conflict('You cannot archive your own account');
      if (existing.role === 'admin' && activeAdmins().length <= 1) return conflict('At least one admin is required');
      const today = clock.today();
      store.tasks
        .list({ where: (t) => t.assigneeId === id && t.status === 'pending' && t.date >= today })
        .forEach((t) => store.tasks.update(t.id, { assigneeId: null }, actor, 'unassign'));
      return success(publicEmployee(store.employees.remove(id, actor)!));
    },
    restore: (id: string, actor: Actor): Outcome<Employee> => {
      const restored = store.employees.restore(id, actor);
      return restored ? success(publicEmployee(restored)) : notFound('Employee');
    },
    authenticate: (username: string, password: string): Employee | undefined => {
      const name = String(username ?? '').trim().toLowerCase();
      const [found] = store.employees.list({ where: (e) => e.username === name });
      return found && verifyPassword(String(password ?? ''), found.passwordHash) ? publicEmployee(found) : undefined;
    },
  };

  /* ---------------- rooms ---------------- */

  const activeStays = (where: (s: Entity<StayRecord>) => boolean) =>
    store.stays.list({ where: (s) => ACTIVE_STAY.includes(s.status) && where(s) });
  const roomNameTaken = (name: string, exceptId?: string) =>
    store.rooms.list().some((r) => r.name.toLowerCase() === name.toLowerCase() && r.id !== exceptId);

  const rooms = {
    list: ({ includeDeleted }: ListFilter = {}) => store.rooms.list({ includeDeleted }),
    get: (id: string) => store.rooms.get(id),
    create: (input: RoomInput, actor: Actor): Outcome<Entity<RoomInput>> => {
      const result = validateRoom(input);
      if (!result.ok) return invalid(result.errors);
      if (roomNameTaken(result.value.name)) return invalid({ name: 'is already in use' }, 409);
      return success(store.rooms.create(result.value, actor));
    },
    update: (id: string, patch: Partial<RoomInput>, actor: Actor): Outcome<Entity<RoomInput>> => {
      if (!isActive(store.rooms.get(id))) return notFound('Room');
      const result = validateRoom(patch, { partial: true });
      if (!result.ok) return invalid(result.errors);
      if (result.value.name && roomNameTaken(result.value.name, id)) return invalid({ name: 'is already in use' }, 409);
      return success(store.rooms.update(id, result.value, actor)!);
    },
    remove: (id: string, actor: Actor): Outcome<Entity<RoomInput>> => {
      if (!isActive(store.rooms.get(id))) return notFound('Room');
      if (activeStays((s) => s.roomId === id).length) return conflict('Room has an active stay');
      return success(store.rooms.remove(id, actor)!);
    },
    restore: (id: string, actor: Actor): Outcome<Entity<RoomInput>> => {
      const restored = store.rooms.restore(id, actor);
      return restored ? success(restored) : notFound('Room');
    },
    /** Active rooms with no active stay overlapping [checkIn, checkOut). */
    available: (checkIn: IsoDate, checkOut: IsoDate): Outcome<Entity<RoomInput>[]> => {
      if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) {
        return invalid({ checkOut: 'must be after check-in' });
      }
      const range = { checkIn, checkOut } as StayInput;
      return success(store.rooms.list().filter((room) => !activeStays((s) => s.roomId === room.id && overlaps(s, range)).length));
    },
    /** Every active room with the stay occupying it on `date` (the night of `date`). */
    occupancy: (date: IsoDate) =>
      store.rooms.list().map((room) => {
        const [stay] = activeStays((s) => s.roomId === room.id && s.checkIn <= date && date < s.checkOut);
        return { ...room, occupied: !!stay, stayId: stay?.id ?? null, petId: stay?.petId ?? null };
      }),
  };

  /* ---------------- owners ---------------- */

  const owners = {
    list: ({ text, includeDeleted }: ListFilter = {}) =>
      store.owners.list({
        includeDeleted,
        where: (o) =>
          includes(
            [o.name, o.email, ...o.contacts.flatMap((c) => [c.name, ...c.phones.map((p) => p.number)])],
            text,
          ),
      }),
    get: (id: string) => store.owners.get(id),
    create: (input: OwnerInput, actor: Actor): Outcome<Entity<OwnerInput>> => {
      const result = validateOwner(input);
      return result.ok ? success(store.owners.create(result.value, actor)) : invalid(result.errors);
    },
    update: (id: string, patch: Partial<OwnerInput>, actor: Actor): Outcome<Entity<OwnerInput>> => {
      if (!isActive(store.owners.get(id))) return notFound('Owner');
      const result = validateOwner(patch, { partial: true });
      return result.ok ? success(store.owners.update(id, result.value, actor)!) : invalid(result.errors);
    },
    remove: (id: string, actor: Actor): Outcome<Entity<OwnerInput>> => {
      if (!isActive(store.owners.get(id))) return notFound('Owner');
      if (store.pets.list({ where: (p) => p.ownerId === id }).length) {
        return conflict('Owner still has pets on file. Archive the pets first');
      }
      return success(store.owners.remove(id, actor)!);
    },
    restore: (id: string, actor: Actor): Outcome<Entity<OwnerInput>> => {
      const restored = store.owners.restore(id, actor);
      return restored ? success(restored) : notFound('Owner');
    },
  };

  /* ---------------- pets ---------------- */

  const ownerError = (ownerId: string | undefined) =>
    ownerId !== undefined && !isActive(store.owners.get(ownerId)) ? invalid({ ownerId: 'does not match an owner' }) : null;

  const pets = {
    list: ({ text, includeDeleted, ownerId }: ListFilter & { ownerId?: string } = {}) =>
      store.pets.list({
        includeDeleted,
        where: (p) =>
          (!ownerId || p.ownerId === ownerId) && includes([p.name, p.breed, p.species, store.owners.get(p.ownerId)?.name], text),
      }),
    get: (id: string) => store.pets.get(id),
    create: (input: PetInput, actor: Actor): Outcome<Entity<PetInput>> => {
      const result = validatePet(input);
      if (!result.ok) return invalid(result.errors);
      return ownerError(result.value.ownerId) ?? success(store.pets.create(result.value, actor));
    },
    update: (id: string, patch: Partial<PetInput>, actor: Actor): Outcome<Entity<PetInput>> => {
      if (!isActive(store.pets.get(id))) return notFound('Pet');
      const result = validatePet(patch, { partial: true });
      if (!result.ok) return invalid(result.errors);
      return ownerError(result.value.ownerId) ?? success(store.pets.update(id, result.value, actor)!);
    },
    remove: (id: string, actor: Actor): Outcome<Entity<PetInput>> => {
      if (!isActive(store.pets.get(id))) return notFound('Pet');
      if (activeStays((s) => s.petId === id).length) return conflict('Pet has an active stay');
      return success(store.pets.remove(id, actor)!);
    },
    restore: (id: string, actor: Actor): Outcome<Entity<PetInput>> => {
      const pet = store.pets.get(id);
      if (!pet) return notFound('Pet');
      if (!isActive(store.owners.get(pet.ownerId))) return conflict('Restore the owner first');
      return success(store.pets.restore(id, actor)!);
    },
  };

  /* ---------------- stays ---------------- */

  const dropPendingTasks = (stayId: string, fromDate: IsoDate, actor: Actor) =>
    store.tasks
      .list({ where: (t) => t.stayId === stayId && t.status === 'pending' && t.date >= fromDate })
      .forEach((t) => store.tasks.remove(t.id, actor));

  const stays = {
    list: ({ petId, roomId, date, status }: { petId?: string; roomId?: string; date?: IsoDate; status?: StayStatus } = {}) =>
      store.stays
        .list({
          where: (s) =>
            (!petId || s.petId === petId) &&
            (!roomId || s.roomId === roomId) &&
            (!status || s.status === status) &&
            (!date || (s.checkIn <= date && date <= s.checkOut)),
        })
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    get: (id: string) => store.stays.get(id),
    arrivals: (date: IsoDate) => store.stays.list({ where: (s) => s.checkIn === date && ACTIVE_STAY.includes(s.status) }),
    departures: (date: IsoDate) => store.stays.list({ where: (s) => s.checkOut === date && s.status !== 'cancelled' }),
    book: (input: StayInput, actor: Actor): Outcome<Entity<StayRecord>> => {
      const result = validateStay(input);
      if (!result.ok) return invalid(result.errors);
      const stay = result.value;
      if (stay.checkIn < clock.today()) return invalid({ checkIn: 'cannot be in the past' });
      if (!isActive(store.pets.get(stay.petId))) return invalid({ petId: 'does not match a pet' });
      if (!isActive(store.rooms.get(stay.roomId))) return invalid({ roomId: 'does not match a room' });
      if (activeStays((s) => s.roomId === stay.roomId && overlaps(s, stay)).length) {
        return invalid({ roomId: 'is already booked for those dates' }, 409);
      }
      if (activeStays((s) => s.petId === stay.petId && overlaps(s, stay)).length) {
        return invalid({ petId: 'already has a stay for those dates' }, 409);
      }
      return success(store.stays.create({ ...stay, status: 'booked' }, actor));
    },
    checkIn: (id: string, actor: Actor): Outcome<Entity<StayRecord>> => {
      const stay = store.stays.get(id);
      if (!stay) return notFound('Stay');
      if (stay.status !== 'booked') return conflict('Only booked stays can be checked in');
      if (clock.today() < stay.checkIn) return conflict(`Check-in opens on ${stay.checkIn}`);
      return success(store.stays.update(id, { status: 'checked_in' }, actor, 'check_in')!);
    },
    checkOut: (id: string, actor: Actor): Outcome<Entity<StayRecord>> => {
      const stay = store.stays.get(id);
      if (!stay) return notFound('Stay');
      if (stay.status !== 'checked_in') return conflict('Only checked-in stays can be checked out');
      const today = clock.today();
      dropPendingTasks(id, addDays(today, 1), actor);
      const checkOut = today < stay.checkOut ? today : stay.checkOut;
      return success(store.stays.update(id, { status: 'checked_out', checkOut }, actor, 'check_out')!);
    },
    cancel: (id: string, actor: Actor): Outcome<Entity<StayRecord>> => {
      const stay = store.stays.get(id);
      if (!stay) return notFound('Stay');
      if (stay.status !== 'booked') return conflict('Only stays that have not checked in can be cancelled');
      dropPendingTasks(id, clock.today(), actor);
      return success(store.stays.update(id, { status: 'cancelled' }, actor, 'cancel')!);
    },
  };

  /* ---------------- notes ---------------- */

  const notes = {
    get: (id: string) => store.notes.get(id),
    list: (petId: string) => store.notes.list({ includeDeleted: true, where: (n) => n.petId === petId }).reverse(),
    add: (petId: string, input: { text: string; taskId?: string | null }, actor: Actor): Outcome<Entity<NoteRecord>> => {
      if (!isActive(store.pets.get(petId))) return notFound('Pet');
      const result = validateNote(input);
      if (!result.ok) return invalid(result.errors);
      const taskId = input?.taskId ?? null;
      if (taskId && store.tasks.get(taskId)?.petId !== petId) return invalid({ taskId: 'does not match a task for this pet' });
      return success(store.notes.create({ petId, text: result.value.text, taskId }, actor));
    },
  };

  /* ---------------- care tasks ---------------- */

  const sortTasks = (list: Task[]) =>
    list.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        slotOrder(a.slot) - slotOrder(b.slot) ||
        (store.rooms.get(a.roomId)?.name ?? '').localeCompare(store.rooms.get(b.roomId)?.name ?? ''),
    );

  const pendingTask = (id: string): Outcome<Task> => {
    const task = store.tasks.get(id);
    if (!isActive(task)) return notFound('Task');
    if (task.status !== 'pending') return conflict('Task is already completed');
    return success(task);
  };

  const staffIdsOrDefault = (staffIds: string[] | undefined): Outcome<string[]> => {
    const ids = staffIds ?? store.employees.list({ where: (e) => e.role === 'staff' }).map((e) => e.id);
    const bad = ids.find((id) => !isActiveStaff(id));
    return bad ? invalid({ staffIds: `${bad} is not active general staff` }) : success(ids);
  };

  /** A task joined with what a carer needs to see: pet, room, owner contacts and the assignee. */
  const detail = (task: Task) => {
    const pet = store.pets.get(task.petId);
    const owner = pet && store.owners.get(pet.ownerId);
    const room = store.rooms.get(task.roomId);
    const assignee = task.assigneeId ? employees.get(task.assigneeId) : undefined;
    return {
      ...task,
      pet: pet && { id: pet.id, name: pet.name, species: pet.species, breed: pet.breed, specialInstructions: pet.specialInstructions },
      room: room && { id: room.id, name: room.name, type: room.type },
      owner: owner && { id: owner.id, name: owner.name, contacts: owner.contacts },
      assignee: assignee && { id: assignee.id, name: assignee.name },
      overdue: isOverdue(task, clock.today(), clock.minutesIntoDay()),
    };
  };

  const tasks = {
    list: ({ date, assigneeId, status }: { date?: IsoDate; assigneeId?: string; status?: string } = {}) =>
      sortTasks(
        store.tasks.list({
          where: (t) => (!date || t.date === date) && (!assigneeId || t.assigneeId === assigneeId) && (!status || t.status === status),
        }),
      ),
    /** Any task, including ones dropped when a stay ended (for the change log). */
    find: (id: string) => store.tasks.get(id),
    board: (date: IsoDate) => tasks.list({ date }).map(detail),
    get: (id: string) => {
      const task = store.tasks.get(id);
      return isActive(task) ? detail(task) : undefined;
    },
    /** A carer's rounds for the day: pending first, then by slot and room. */
    queue: (assigneeId: string, date: IsoDate) =>
      tasks
        .list({ date, assigneeId })
        .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))
        .map(detail),

    generate: (date: IsoDate, staffIds: string[] | undefined, actor: Actor): Outcome<Task[]> => {
      if (!isIsoDate(date)) return invalid({ date: 'must be a date (YYYY-MM-DD)' });
      const staff = staffIdsOrDefault(staffIds);
      if (!staff.ok) return staff;
      const existing = store.tasks.list({ where: (t) => t.date === date });
      const planned = planCareTasks(date, store.stays.list(), existing).map((t, i) => ({ ...t, key: String(i), assigneeId: null }));
      const assigned = assignEvenly(planned, staff.value, existing.map((t) => t.assigneeId));
      const created = assigned.map(({ key: _key, ...task }) =>
        store.tasks.create({ ...task, cleaned: false, fed: false, photoId: null, status: 'pending', completedAt: null }, actor),
      );
      return success(sortTasks(created));
    },

    rebalance: (date: IsoDate, staffIds: string[] | undefined, actor: Actor): Outcome<Task[]> => {
      const staff = staffIdsOrDefault(staffIds);
      if (!staff.ok) return staff;
      const all = tasks.list({ date });
      const pending = all.filter((t) => t.status === 'pending').map((t) => ({ ...t, key: t.id }));
      const fixed = all.filter((t) => t.status !== 'pending').map((t) => t.assigneeId);
      assignEvenly(pending, staff.value, fixed).forEach((t) => {
        store.tasks.update(t.id, { assigneeId: t.assigneeId }, actor, 'reassign');
      });
      return success(tasks.list({ date }));
    },

    reassign: (id: string, assigneeId: string | null, actor: Actor): Outcome<Task> => {
      const task = pendingTask(id);
      if (!task.ok) return task;
      if (assigneeId !== null && !isActiveStaff(assigneeId)) return invalid({ assigneeId: 'is not active general staff' });
      return success(store.tasks.update(id, { assigneeId }, actor, 'reassign')!);
    },

    update: (id: string, patch: { cleaned?: unknown; fed?: unknown }, actor: Actor): Outcome<Task> => {
      const task = pendingTask(id);
      if (!task.ok) return task;
      const changes: Partial<TaskRecord> = {};
      for (const field of ['cleaned', 'fed'] as const) {
        if (patch?.[field] === undefined) continue;
        if (typeof patch[field] !== 'boolean') return invalid({ [field]: 'must be true or false' });
        changes[field] = patch[field];
      }
      return success(store.tasks.update(id, changes, actor)!);
    },

    attachPhoto: (id: string, photoId: string, actor: Actor): Outcome<Task> => {
      const task = pendingTask(id);
      if (!task.ok) return task;
      return success(store.tasks.update(id, { photoId }, actor, 'photo')!);
    },

    complete: (id: string, actor: Actor): Outcome<Task> => {
      const task = pendingTask(id);
      if (!task.ok) return task;
      const { cleaned, fed, photoId } = task.value;
      const errors: Record<string, string> = {};
      if (!cleaned) errors.cleaned = 'must be checked';
      if (!fed) errors.fed = 'must be checked';
      if (!photoId) errors.photo = 'is required';
      if (Object.keys(errors).length) return invalid(errors);
      return success(store.tasks.update(id, { status: 'completed', completedAt: clock.now().toISOString() }, actor, 'complete')!);
    },
  };

  const hotel = {
    clock,
    audit,
    photos,
    sessions,
    loginThrottle,
    employees,
    rooms,
    owners,
    pets,
    stays,
    notes,
    tasks,
    reset: () => {
      Object.values(store).forEach((s) => s.reset());
      audit.reset();
      photos.reset();
      sessions.reset();
      loginThrottle.reset();
      if (seed) seedHotel({ hotel, store, today: clock.today() });
    },
  };

  hotel.reset();
  return hotel;
}

export type Hotel = ReturnType<typeof createHotel>;
/** Raw stores, used by the seed to insert history (past stays) that the public rules would refuse. */
export type HotelStores = {
  employees: EntityStore<EmployeeRecord>;
  stays: EntityStore<StayRecord>;
  notes: EntityStore<NoteRecord>;
};
