import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { isIsoDate } from './clock';
import type { Hotel } from './hotel';
import type { Outcome } from './outcome';
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from './photos';
import { readCookie, SESSION_COOKIE, SESSION_TTL_MS } from './sessions';
import { isOverdue } from './scheduling';
import type { Employee, Entity, PetInput, Role, StayRecord } from './types';

type AuthedRequest = Request & { employee: Employee };
type Handler = (req: AuthedRequest, res: Response) => void;

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
const flag = (value: unknown) => value === 'true';
const actorOf = (req: AuthedRequest) => ({ id: req.employee.id, name: req.employee.name });

/** Sends an Outcome: the value with `okStatus`, or `{ error, errors }` with the failure status. */
function send<T>(res: Response, outcome: Outcome<T>, okStatus = 200, view: (value: T) => unknown = (v) => v) {
  if (outcome.ok) res.status(okStatus).json(view(outcome.value));
  else res.status(outcome.status).json(outcome.errors ? { error: outcome.error, errors: outcome.errors } : { error: outcome.error });
}

const sendFound = (res: Response, value: unknown, what: string) =>
  value ? res.json(value) : res.status(404).json({ error: `${what} not found` });

/**
 * The pet hotel REST API, mounted at /api/hotel. Sessions are opaque tokens in an HttpOnly,
 * SameSite=Strict cookie. Every route except login requires a session; most also require a role.
 */
export function hotelRoutes(hotel: Hotel) {
  const router = Router();
  const today = () => hotel.clock.today();
  const dateParam = (value: unknown) => (isIsoDate(value) ? value : today());

  /* ---------- views that join related entities for the UI ---------- */

  const primaryPhone = (ownerId: string) => hotel.owners.get(ownerId)?.contacts[0]?.phones[0]?.number ?? '';
  const ownerSummary = (ownerId: string) => {
    const owner = hotel.owners.get(ownerId);
    return owner && { id: owner.id, name: owner.name, phone: primaryPhone(ownerId), deletedAt: owner.deletedAt };
  };
  const petView = (pet: Entity<PetInput>) => ({ ...pet, owner: ownerSummary(pet.ownerId) });
  const stayView = (stay: Entity<StayRecord>) => {
    const pet = hotel.pets.get(stay.petId);
    const room = hotel.rooms.get(stay.roomId);
    return {
      ...stay,
      pet: pet && { id: pet.id, name: pet.name, species: pet.species, breed: pet.breed, specialInstructions: pet.specialInstructions },
      owner: pet && ownerSummary(pet.ownerId),
      room: room && { id: room.id, name: room.name, type: room.type },
    };
  };

  /* ---------- session + role guards ---------- */

  const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const employeeId = hotel.sessions.resolve(readCookie(req.headers.cookie, SESSION_COOKIE));
    const employee = employeeId ? hotel.employees.get(employeeId) : undefined;
    if (!employee || employee.deletedAt) {
      res.status(401).json({ error: 'Please sign in' });
      return;
    }
    (req as AuthedRequest).employee = employee;
    res.locals.employeeId = employee.id;
    next();
  };

  const allow =
    (...roles: Role[]) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (roles.includes((req as AuthedRequest).employee.role)) next();
      else res.status(403).json({ error: 'You do not have access to this' });
    };

  const h = (handler: Handler) => (req: Request, res: Response) => handler(req as AuthedRequest, res);
  const ADMIN = allow('admin');
  const DESK = allow('admin', 'receiving');

  /* ---------- auth ---------- */

  router.post('/auth/login', (req, res) => {
    const { username, password } = req.body ?? {};
    const key = `${String(username ?? '').trim().toLowerCase()}|${req.ip}`;
    const gate = hotel.loginThrottle.check(key);
    if (!gate.allowed) {
      const minutes = Math.ceil(gate.retryAfterSeconds / 60);
      res
        .status(429)
        .set('Retry-After', String(gate.retryAfterSeconds))
        .json({ error: `Too many failed sign-in attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.` });
      return;
    }
    const employee = hotel.employees.authenticate(username, password);
    if (!employee) {
      hotel.loginThrottle.fail(key);
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }
    hotel.loginThrottle.succeed(key);
    const token = hotel.sessions.create(employee.id);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: SESSION_TTL_MS });
    res.json({ employee });
  });

  router.post('/auth/logout', (req, res) => {
    hotel.sessions.revoke(readCookie(req.headers.cookie, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.use(authenticate);

  router.get('/auth/me', h((req, res) => res.json({ employee: req.employee, today: today() })));
  router.post('/auth/password', h((req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    send(res, hotel.employees.changeOwnPassword(req.employee.id, currentPassword, newPassword, actorOf(req)), 200, (employee) => ({ employee }));
  }));

  // Someone on a temporary password can only choose a new one (or sign out).
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (!(req as AuthedRequest).employee.mustChangePassword) return next();
    res.status(403).json({ error: 'Choose a new password to continue', code: 'password_change_required' });
  });

  /* ---------- employees (admin) ---------- */

  router.get('/employees/staff', DESK, (_req, res) => {
    res.json(hotel.employees.list().filter((e) => e.role === 'staff'));
  });
  router.get('/employees', ADMIN, (req, res) => {
    res.json(hotel.employees.list({ text: str(req.query.text), includeDeleted: flag(req.query.includeDeleted) }));
  });
  router.get('/employees/:id', ADMIN, (req, res) => sendFound(res, hotel.employees.get(String(req.params.id)), 'Employee'));
  router.post('/employees', ADMIN, h((req, res) => send(res, hotel.employees.create(req.body, actorOf(req)), 201)));
  router.put('/employees/:id', ADMIN, h((req, res) => send(res, hotel.employees.update(String(req.params.id), req.body, actorOf(req)))));
  router.delete('/employees/:id', ADMIN, h((req, res) => send(res, hotel.employees.remove(String(req.params.id), actorOf(req)))));
  router.post('/employees/:id/restore', ADMIN, h((req, res) => send(res, hotel.employees.restore(String(req.params.id), actorOf(req)))));

  /* ---------- change log (admin) ---------- */

  const petName = (id: string | undefined) => (id ? hotel.pets.get(id)?.name : undefined) ?? 'unknown pet';
  const SLOT_NAMES: Record<string, string> = { morning: 'Morning', evening: 'Evening' };
  const LABELS: Record<string, (id: string) => string | undefined> = {
    employee: (id) => hotel.employees.get(id)?.name,
    owner: (id) => hotel.owners.get(id)?.name,
    pet: (id) => hotel.pets.get(id)?.name,
    room: (id) => hotel.rooms.get(id)?.name,
    stay: (id) => {
      const stay = hotel.stays.get(id);
      return stay && `${petName(stay.petId)} in ${hotel.rooms.get(stay.roomId)?.name ?? 'unknown room'}`;
    },
    note: (id) => `Note on ${petName(hotel.notes.get(id)?.petId)}`,
    task: (id) => {
      const task = hotel.tasks.find(id);
      return task && `${SLOT_NAMES[task.slot]} round · ${petName(task.petId)}`;
    },
  };

  router.get('/audit', ADMIN, (req, res) => {
    const from = str(req.query.from) || undefined;
    const to = str(req.query.to) || undefined;
    if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) {
      res.status(400).json({ error: 'Validation failed', errors: { from: 'must be a date (YYYY-MM-DD)' } });
      return;
    }
    const requested = Number(req.query.limit);
    const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 500) : 50;
    const page = hotel.audit.list({
      entityType: str(req.query.entityType) || undefined,
      entityId: str(req.query.entityId) || undefined,
      before: str(req.query.before) || undefined,
      from,
      to,
      limit: limit + 1, // one extra tells us whether another page exists
    });
    const entries = page.slice(0, limit);
    if (page.length > limit) res.set('X-Next-Cursor', entries.at(-1)!.id);
    res.json(entries.map((entry) => ({ ...entry, label: LABELS[entry.entityType]?.(entry.entityId) ?? entry.entityId })));
  });

  /* ---------- rooms ---------- */

  router.get('/rooms', (req, res) => res.json(hotel.rooms.list({ includeDeleted: flag(req.query.includeDeleted) })));
  router.get('/rooms/occupancy', DESK, (req, res) => {
    res.json(
      hotel.rooms.occupancy(dateParam(req.query.date)).map((room) => {
        const pet = room.petId ? hotel.pets.get(room.petId) : undefined;
        return { ...room, pet: pet && { id: pet.id, name: pet.name, species: pet.species } };
      }),
    );
  });
  router.get('/rooms/available', DESK, (req, res) => {
    send(res, hotel.rooms.available(String(req.query.checkIn ?? ''), String(req.query.checkOut ?? ''), str(req.query.excludeStayId)));
  });
  router.post('/rooms', ADMIN, h((req, res) => send(res, hotel.rooms.create(req.body, actorOf(req)), 201)));
  router.put('/rooms/:id', ADMIN, h((req, res) => send(res, hotel.rooms.update(String(req.params.id), req.body, actorOf(req)))));
  router.delete('/rooms/:id', ADMIN, h((req, res) => send(res, hotel.rooms.remove(String(req.params.id), actorOf(req)))));
  router.post('/rooms/:id/restore', ADMIN, h((req, res) => send(res, hotel.rooms.restore(String(req.params.id), actorOf(req)))));

  /* ---------- owners (front desk) ---------- */

  router.get('/owners', DESK, (req, res) => {
    res.json(
      hotel.owners.list({ text: str(req.query.text), includeDeleted: flag(req.query.includeDeleted) }).map((owner) => ({
        ...owner,
        petCount: hotel.pets.list({ ownerId: owner.id }).length,
      })),
    );
  });
  router.get('/owners/duplicates', DESK, (req, res) => {
    const phones = ([] as unknown[]).concat(req.query.phone ?? []).map(String);
    res.json(
      hotel.owners.duplicates({ name: str(req.query.name), email: str(req.query.email), phones, excludeId: str(req.query.excludeId) }),
    );
  });
  router.get('/owners/:id', DESK, (req, res) => sendFound(res, hotel.owners.get(String(req.params.id)), 'Owner'));
  router.post('/owners', DESK, h((req, res) => send(res, hotel.owners.create(req.body, actorOf(req)), 201)));
  router.put('/owners/:id', DESK, h((req, res) => send(res, hotel.owners.update(String(req.params.id), req.body, actorOf(req)))));
  router.delete('/owners/:id', DESK, h((req, res) => send(res, hotel.owners.remove(String(req.params.id), actorOf(req)))));
  router.post('/owners/:id/restore', DESK, h((req, res) => send(res, hotel.owners.restore(String(req.params.id), actorOf(req)))));

  /* ---------- pets ---------- */

  router.get('/pets', DESK, (req, res) => {
    res.json(
      hotel.pets
        .list({ text: str(req.query.text), ownerId: str(req.query.ownerId), includeDeleted: flag(req.query.includeDeleted) })
        .map(petView),
    );
  });
  // Any signed-in employee can read a pet (carers need it); only the front desk can change one.
  router.get('/pets/:id', (req, res) => {
    const pet = hotel.pets.get(String(req.params.id));
    sendFound(res, pet && petView(pet), 'Pet');
  });
  router.post('/pets', DESK, h((req, res) => send(res, hotel.pets.create(req.body, actorOf(req)), 201, petView)));
  router.put('/pets/:id', DESK, h((req, res) => send(res, hotel.pets.update(String(req.params.id), req.body, actorOf(req)), 200, petView)));
  router.delete('/pets/:id', DESK, h((req, res) => send(res, hotel.pets.remove(String(req.params.id), actorOf(req)))));
  router.post('/pets/:id/restore', DESK, h((req, res) => send(res, hotel.pets.restore(String(req.params.id), actorOf(req)))));
  router.get('/pets/:id/stays', DESK, (req, res) => res.json(hotel.stays.list({ petId: String(req.params.id) }).map(stayView)));

  // Notes are append-only: there is deliberately no PUT or DELETE.
  router.get('/pets/:id/notes', (req, res) => {
    if (!hotel.pets.get(String(req.params.id))) res.status(404).json({ error: 'Pet not found' });
    else res.json(hotel.notes.list(String(req.params.id)));
  });
  router.post('/pets/:id/notes', h((req, res) => send(res, hotel.notes.add(String(req.params.id), req.body, actorOf(req)), 201)));

  /* ---------- stays (front desk) ---------- */

  router.get('/stays', DESK, (req, res) => {
    const date = isIsoDate(req.query.date) ? req.query.date : undefined;
    res.json(hotel.stays.list({ date, petId: str(req.query.petId) }).map(stayView));
  });
  router.get('/stays/arrivals', DESK, (req, res) => res.json(hotel.stays.arrivals(dateParam(req.query.date)).map(stayView)));
  router.get('/stays/departures', DESK, (req, res) => res.json(hotel.stays.departures(dateParam(req.query.date)).map(stayView)));
  router.post('/stays', DESK, h((req, res) => send(res, hotel.stays.book(req.body, actorOf(req)), 201, stayView)));
  router.put('/stays/:id', DESK, h((req, res) => {
    const { checkIn, checkOut, roomId } = req.body ?? {};
    send(res, hotel.stays.change(String(req.params.id), { checkIn, checkOut, roomId }, actorOf(req)), 200, stayView);
  }));
  router.post('/stays/:id/check-in', DESK, h((req, res) => send(res, hotel.stays.checkIn(String(req.params.id), actorOf(req)), 200, stayView)));
  router.post('/stays/:id/check-out', DESK, h((req, res) => send(res, hotel.stays.checkOut(String(req.params.id), actorOf(req)), 200, stayView)));
  router.post('/stays/:id/cancel', DESK, h((req, res) => send(res, hotel.stays.cancel(String(req.params.id), actorOf(req)), 200, stayView)));

  router.get('/dashboard', DESK, (req, res) => {
    const date = dateParam(req.query.date);
    const occupancy = hotel.rooms.occupancy(date);
    const tasks = hotel.tasks.list({ date });
    res.json({
      date,
      arrivals: hotel.stays.arrivals(date).length,
      departures: hotel.stays.departures(date).length,
      inHouse: hotel.stays.list({ date, status: 'checked_in' }).length,
      rooms: occupancy.length,
      occupiedRooms: occupancy.filter((r) => r.occupied).length,
      tasks: {
        total: tasks.length,
        completed: tasks.filter((t) => t.status === 'completed').length,
        unassigned: tasks.filter((t) => !t.assigneeId).length,
        overdue: tasks.filter((t) => isOverdue(t, today(), hotel.clock.minutesIntoDay())).length,
      },
    });
  });

  /* ---------- care tasks ---------- */

  router.get('/tasks', DESK, (req, res) => res.json(hotel.tasks.board(dateParam(req.query.date))));
  router.get('/tasks/mine', h((req, res) => res.json(hotel.tasks.queue(req.employee.id, dateParam(req.query.date)))));
  router.post('/tasks/generate', DESK, h((req, res) => {
    const { date, staffIds } = req.body ?? {};
    send(res, hotel.tasks.generate(dateParam(date), Array.isArray(staffIds) ? staffIds : undefined, actorOf(req)), 201);
  }));
  router.post('/tasks/rebalance', DESK, h((req, res) => {
    const { date, staffIds } = req.body ?? {};
    send(res, hotel.tasks.rebalance(dateParam(date), Array.isArray(staffIds) ? staffIds : undefined, actorOf(req)));
  }));
  router.put('/tasks/:id/assignee', DESK, h((req, res) => {
    send(res, hotel.tasks.reassign(String(req.params.id), req.body?.assigneeId ?? null, actorOf(req)));
  }));

  /** Carers may only see and work their own tasks; the front desk may view any. */
  const taskAccess = (mode: 'view' | 'work') => (req: Request, res: Response, next: NextFunction) => {
    const { employee } = req as AuthedRequest;
    const task = hotel.tasks.get(String(req.params.id));
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const isAssignee = task.assigneeId === employee.id;
    const canView = isAssignee || employee.role !== 'staff';
    if (mode === 'work' ? isAssignee : canView) next();
    else res.status(403).json({ error: 'This task is assigned to someone else' });
  };

  router.get('/tasks/:id', taskAccess('view'), (req, res) => res.json(hotel.tasks.get(String(req.params.id))));
  router.put('/tasks/:id', taskAccess('work'), h((req, res) => send(res, hotel.tasks.update(String(req.params.id), req.body, actorOf(req)))));
  router.post('/tasks/:id/complete', taskAccess('work'), h((req, res) => send(res, hotel.tasks.complete(String(req.params.id), actorOf(req)))));
  router.post(
    '/tasks/:id/photo',
    taskAccess('work'),
    express.raw({ type: () => true, limit: MAX_PHOTO_BYTES }),
    h((req, res) => {
      const type = String(req.headers['content-type'] ?? '').split(';')[0].trim();
      if (!(PHOTO_TYPES as readonly string[]).includes(type)) {
        res.status(415).json({ error: `Photo must be one of ${PHOTO_TYPES.join(', ')}` });
        return;
      }
      if (!Buffer.isBuffer(req.body) || !req.body.length) {
        res.status(400).json({ error: 'Photo is empty' });
        return;
      }
      const photo = hotel.photos.save(req.body, type, actorOf(req));
      send(res, hotel.tasks.attachPhoto(String(req.params.id), photo.id, actorOf(req)));
    }),
  );

  router.get('/photos/:id', (req, res) => {
    const photo = hotel.photos.get(String(req.params.id));
    if (!photo) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }
    res.type(photo.contentType).set('Cache-Control', 'private, max-age=86400').send(photo.data);
  });

  // JSON errors for body parsing problems (oversized photo, malformed JSON) instead of HTML pages.
  router.use((error: { status?: number; message?: string }, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 500;
    res.status(status).json({ error: status === 413 ? 'Photo must be 5 MB or smaller' : status === 500 ? 'Something went wrong' : error.message });
  });

  return router;
}
