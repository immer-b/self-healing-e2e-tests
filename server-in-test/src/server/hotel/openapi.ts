/**
 * OpenAPI 3.1 description of /api/hotel. Written by hand next to the router; a test checks that
 * every route the router serves is documented here and nothing else, so the two can't drift.
 */

type Schema = Record<string, unknown>;
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Schema) => ({ content: { 'application/json': { schema } } });
const arrayOf = (schema: Schema): Schema => ({ type: 'array', items: schema });
const str: Schema = { type: 'string' };
const date: Schema = { type: 'string', format: 'date' };
const idParam = { name: 'id', in: 'path', required: true, schema: str };
const q = (name: string, schema: Schema = str, description?: string) => ({ name, in: 'query', required: false, schema, description });

const ERRORS = {
  400: { description: 'Invalid input', ...json(ref('ValidationError')) },
  401: { description: 'Not signed in', ...json(ref('Error')) },
  403: { description: 'Not allowed for this role', ...json(ref('Error')) },
  404: { description: 'Not found', ...json(ref('Error')) },
  409: { description: 'Conflicts with the current state', ...json(ref('ValidationError')) },
};

interface Op {
  summary: string;
  tag: string;
  roles?: string;
  body?: Schema;
  params?: unknown[];
  ok?: number;
  returns?: Schema | null;
  errors?: (keyof typeof ERRORS)[];
  public?: boolean;
  description?: string;
}

function operation({ summary, tag, roles, body, params = [], ok = 200, returns, errors = [401, 403], public: isPublic, description }: Op) {
  const responses: Record<string, unknown> = {
    [ok]: returns === null ? { description: 'Done' } : { description: 'OK', ...(returns ? json(returns) : {}) },
  };
  for (const code of isPublic ? errors.filter((c) => c !== 401 && c !== 403) : errors) responses[code] = ERRORS[code];
  return {
    summary,
    tags: [tag],
    ...(description || roles ? { description: [description, roles && `Roles: ${roles}.`].filter(Boolean).join(' ') } : {}),
    ...(isPublic ? { security: [] } : {}),
    ...(params.length ? { parameters: params } : {}),
    ...(body ? { requestBody: { required: true, ...json(body) } } : {}),
    responses,
  };
}

const crud = (tag: string, plural: string, entity: string, input: string, roles: { read: string; write: string }, extra: { list?: unknown[] } = {}) => ({
  [`/${plural}`]: {
    get: operation({ summary: `List ${plural}`, tag, roles: roles.read, params: [q('text'), q('includeDeleted', { type: 'boolean' }), ...(extra.list ?? [])], returns: arrayOf(ref(entity)) }),
    post: operation({ summary: `Create a ${tag.toLowerCase().replace(/s$/, '')}`, tag, roles: roles.write, body: ref(input), ok: 201, returns: ref(entity), errors: [400, 401, 403, 409] }),
  },
  [`/${plural}/{id}/restore`]: {
    post: operation({ summary: `Restore an archived ${tag.toLowerCase().replace(/s$/, '')}`, tag, roles: roles.write, params: [idParam], returns: ref(entity), errors: [401, 403, 404, 409] }),
  },
});

const DESK = 'admin, receiving';
const ANY = 'any signed-in employee';

export function openApiDocument() {
  const employees = crud('Employees', 'employees', 'Employee', 'EmployeeInput', { read: 'admin', write: 'admin' });
  const rooms = crud('Rooms', 'rooms', 'Room', 'RoomInput', { read: ANY, write: 'admin' });
  const owners = crud('Owners', 'owners', 'Owner', 'OwnerInput', { read: DESK, write: DESK });
  const pets = crud('Pets', 'pets', 'Pet', 'PetInput', { read: DESK, write: DESK }, { list: [q('ownerId')] });
  rooms['/rooms'].get = operation({ summary: 'List rooms', tag: 'Rooms', roles: ANY, params: [q('includeDeleted', { type: 'boolean' })], returns: arrayOf(ref('Room')) });

  const byId = (tag: string, entity: string, input: string, roles: string, name: string) => ({
    put: operation({ summary: `Update a ${name}`, tag, roles, params: [idParam], body: ref(input), returns: ref(entity), errors: [400, 401, 403, 404, 409] }),
    delete: operation({ summary: `Archive a ${name} (nothing is ever deleted)`, tag, roles, params: [idParam], returns: ref(entity), errors: [401, 403, 404, 409] }),
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'Willow Pet Hotel API',
      version: '1.0.0',
      description:
        'Staff API for the pet hotel. Sessions are an HttpOnly cookie set by POST /auth/login. Every write is audited; records are archived, never deleted.',
    },
    servers: [{ url: '/api/hotel' }],
    components: {
      securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'hotel_session' } },
      schemas: {
        Error: { type: 'object', properties: { error: str, code: str }, required: ['error'] },
        ValidationError: { type: 'object', properties: { error: str, errors: { type: 'object', additionalProperties: str } }, required: ['error'] },
        Actor: { type: 'object', properties: { id: str, name: str } },
        Meta: {
          type: 'object',
          properties: { id: str, createdAt: str, createdBy: ref('Actor'), updatedAt: str, updatedBy: ref('Actor'), deletedAt: { type: ['string', 'null'] }, deletedBy: { oneOf: [ref('Actor'), { type: 'null' }] } },
        },
        EmployeeInput: {
          type: 'object',
          properties: { name: str, username: str, email: str, phone: str, role: { enum: ['admin', 'receiving', 'staff'] }, type: { enum: ['front_desk', 'maintenance'] }, password: { type: 'string', minLength: 8 } },
          required: ['name', 'username', 'role', 'type'],
        },
        Employee: { allOf: [ref('Meta'), ref('EmployeeInput'), { type: 'object', properties: { mustChangePassword: { type: 'boolean' } } }] },
        RoomInput: { type: 'object', properties: { name: str, type: { enum: ['exclusive', 'midline', 'basic'] }, nightlyRate: { type: 'number', minimum: 0 } }, required: ['name', 'type', 'nightlyRate'] },
        Room: { allOf: [ref('Meta'), ref('RoomInput')] },
        Phone: { type: 'object', properties: { label: str, number: str }, required: ['number'] },
        Contact: { type: 'object', properties: { name: str, relationship: str, phones: arrayOf(ref('Phone')) }, required: ['name', 'relationship', 'phones'] },
        Address: { type: 'object', properties: { line1: str, line2: str, city: str, state: str, postalCode: str }, required: ['line1', 'city', 'state', 'postalCode'] },
        OwnerInput: { type: 'object', properties: { name: str, email: str, address: ref('Address'), contacts: arrayOf(ref('Contact')) }, required: ['name', 'address', 'contacts'] },
        Owner: { allOf: [ref('Meta'), ref('OwnerInput')] },
        Vaccination: { type: 'object', properties: { name: str, expiresOn: date }, required: ['name', 'expiresOn'] },
        PetInput: {
          type: 'object',
          properties: {
            name: str,
            species: { enum: ['dog', 'cat', 'other'] },
            breed: str,
            ownerId: str,
            specialInstructions: str,
            dateOfBirth: str,
            weightLbs: { type: ['number', 'null'] },
            vet: { type: 'object', properties: { name: str, phone: str } },
            vaccinations: arrayOf(ref('Vaccination')),
          },
          required: ['name', 'species', 'breed', 'ownerId'],
        },
        Pet: { allOf: [ref('Meta'), ref('PetInput')] },
        StayInput: { type: 'object', properties: { petId: str, roomId: str, checkIn: date, checkOut: date }, required: ['petId', 'roomId', 'checkIn', 'checkOut'] },
        Stay: { allOf: [ref('Meta'), ref('StayInput'), { type: 'object', properties: { status: { enum: ['booked', 'checked_in', 'checked_out', 'cancelled'] } } }] },
        NoteInput: { type: 'object', properties: { text: { type: 'string', maxLength: 2000 }, taskId: str, amends: str }, required: ['text'] },
        Note: { allOf: [ref('Meta'), { type: 'object', properties: { petId: str, text: str, taskId: { type: ['string', 'null'] }, amends: { type: ['string', 'null'] } } }] },
        Task: {
          allOf: [
            ref('Meta'),
            {
              type: 'object',
              properties: {
                date,
                slot: { enum: ['morning', 'evening'] },
                petId: str,
                stayId: str,
                roomId: str,
                assigneeId: { type: ['string', 'null'] },
                cleaned: { type: 'boolean' },
                fed: { type: 'boolean' },
                photoId: { type: ['string', 'null'] },
                status: { enum: ['pending', 'completed'] },
                completedAt: { type: ['string', 'null'] },
                overdue: { type: 'boolean' },
              },
            },
          ],
        },
        AuditEntry: {
          type: 'object',
          properties: { id: str, entityType: str, entityId: str, label: str, action: str, actor: ref('Actor'), at: str, changes: arrayOf({ type: 'object', properties: { field: str, from: {}, to: {} } }) },
        },
        Dashboard: { type: 'object', properties: { date, arrivals: { type: 'integer' }, departures: { type: 'integer' }, inHouse: { type: 'integer' }, rooms: { type: 'integer' }, occupiedRooms: { type: 'integer' }, tasks: { type: 'object' } } },
      },
    },
    security: [{ session: [] }],
    paths: {
      '/openapi.json': { get: operation({ summary: 'This document', tag: 'Meta', public: true, returns: { type: 'object' } }) },
      '/auth/login': {
        post: operation({ summary: 'Sign in (sets the session cookie)', tag: 'Auth', public: true, body: { type: 'object', properties: { username: str, password: str } }, returns: { type: 'object', properties: { employee: ref('Employee') } }, errors: [401], description: 'Locked for 15 minutes after 5 failures (429).' }),
      },
      '/auth/logout': { post: operation({ summary: 'Sign out', tag: 'Auth', public: true, ok: 204, returns: null }) },
      '/auth/me': { get: operation({ summary: 'The signed-in employee and the hotel’s today', tag: 'Auth', roles: ANY, returns: { type: 'object', properties: { employee: ref('Employee'), today: date } }, errors: [401] }) },
      '/auth/password': {
        post: operation({ summary: 'Change your own password', tag: 'Auth', roles: ANY, body: { type: 'object', properties: { currentPassword: str, newPassword: str } }, returns: { type: 'object', properties: { employee: ref('Employee') } }, errors: [400, 401] }),
      },
      '/events': { get: operation({ summary: 'Live change notifications (Server-Sent Events)', tag: 'Live', roles: ANY, returns: { type: 'string', description: 'text/event-stream of `change` events: { entityType, entityId, action }' }, errors: [401] }) },

      ...employees,
      '/employees/staff': { get: operation({ summary: 'Active general staff, for scheduling', tag: 'Employees', roles: DESK, returns: arrayOf(ref('Employee')) }) },
      '/employees/{id}': {
        get: operation({ summary: 'One employee', tag: 'Employees', roles: 'admin', params: [idParam], returns: ref('Employee'), errors: [401, 403, 404] }),
        ...byId('Employees', 'Employee', 'EmployeeInput', 'admin', 'employee'),
      },
      '/audit': {
        get: operation({ summary: 'Change log, newest first (50 per page, cursor in X-Next-Cursor)', tag: 'Change log', roles: 'admin', params: [q('entityType'), q('entityId'), q('from', date), q('to', date), q('before'), q('limit', { type: 'integer' })], returns: arrayOf(ref('AuditEntry')), errors: [400, 401, 403] }),
      },

      ...rooms,
      '/rooms/occupancy': { get: operation({ summary: 'Who is in each room on a night', tag: 'Rooms', roles: DESK, params: [q('date', date)], returns: arrayOf(ref('Room')) }) },
      '/rooms/available': { get: operation({ summary: 'Rooms free for a whole date range', tag: 'Rooms', roles: DESK, params: [q('checkIn', date), q('checkOut', date), q('excludeStayId')], returns: arrayOf(ref('Room')), errors: [400, 401, 403] }) },
      '/rooms/{id}': byId('Rooms', 'Room', 'RoomInput', 'admin', 'room'),

      ...owners,
      '/owners/duplicates': { get: operation({ summary: 'Owners who look like the same person', tag: 'Owners', roles: DESK, params: [q('name'), q('email'), q('phone'), q('excludeId')], returns: arrayOf(ref('Owner')) }) },
      '/owners/{id}': {
        get: operation({ summary: 'One owner', tag: 'Owners', roles: DESK, params: [idParam], returns: ref('Owner'), errors: [401, 403, 404] }),
        ...byId('Owners', 'Owner', 'OwnerInput', DESK, 'owner'),
      },

      ...pets,
      '/pets/{id}': {
        get: operation({ summary: 'One pet', tag: 'Pets', roles: ANY, params: [idParam], returns: ref('Pet'), errors: [401, 404] }),
        ...byId('Pets', 'Pet', 'PetInput', DESK, 'pet'),
      },
      '/pets/{id}/stays': { get: operation({ summary: 'A pet’s stays', tag: 'Pets', roles: DESK, params: [idParam], returns: arrayOf(ref('Stay')) }) },
      '/pets/{id}/notes': {
        get: operation({ summary: 'A pet’s notes, newest first', tag: 'Notes', roles: ANY, params: [idParam], returns: arrayOf(ref('Note')), errors: [401, 404] }),
        post: operation({ summary: 'Append a note (or an addendum with `amends`)', tag: 'Notes', roles: ANY, params: [idParam], body: ref('NoteInput'), ok: 201, returns: ref('Note'), errors: [400, 401, 404], description: 'Notes are permanent: there is no edit or delete.' }),
      },

      '/stays': {
        get: operation({ summary: 'Stays', tag: 'Stays', roles: DESK, params: [q('date', date), q('petId')], returns: arrayOf(ref('Stay')) }),
        post: operation({ summary: 'Book a room', tag: 'Stays', roles: DESK, body: ref('StayInput'), ok: 201, returns: ref('Stay'), errors: [400, 401, 403, 409] }),
      },
      '/stays/arrivals': { get: operation({ summary: 'Stays arriving on a date', tag: 'Stays', roles: DESK, params: [q('date', date)], returns: arrayOf(ref('Stay')) }) },
      '/stays/departures': { get: operation({ summary: 'Stays leaving on a date', tag: 'Stays', roles: DESK, params: [q('date', date)], returns: arrayOf(ref('Stay')) }) },
      '/stays/{id}': {
        put: operation({ summary: 'Change dates or room', tag: 'Stays', roles: DESK, params: [idParam], body: { type: 'object', properties: { checkIn: date, checkOut: date, roomId: str } }, returns: ref('Stay'), errors: [400, 401, 403, 404, 409] }),
      },
      '/stays/{id}/check-in': { post: operation({ summary: 'Check a pet in', tag: 'Stays', roles: DESK, params: [idParam], returns: ref('Stay'), errors: [401, 403, 404, 409] }) },
      '/stays/{id}/check-out': { post: operation({ summary: 'Check a pet out', tag: 'Stays', roles: DESK, params: [idParam], returns: ref('Stay'), errors: [401, 403, 404, 409] }) },
      '/stays/{id}/cancel': { post: operation({ summary: 'Cancel a booking', tag: 'Stays', roles: DESK, params: [idParam], returns: ref('Stay'), errors: [401, 403, 404, 409] }) },
      '/dashboard': { get: operation({ summary: 'The day in numbers', tag: 'Stays', roles: DESK, params: [q('date', date)], returns: ref('Dashboard') }) },

      '/tasks': { get: operation({ summary: 'The care board for a date', tag: 'Care rounds', roles: DESK, params: [q('date', date)], returns: arrayOf(ref('Task')) }) },
      '/tasks/mine': { get: operation({ summary: 'Your rounds for today, pending first', tag: 'Care rounds', roles: ANY, returns: arrayOf(ref('Task')), errors: [401] }) },
      '/tasks/generate': {
        post: operation({ summary: 'Create missing rounds and share them evenly', tag: 'Care rounds', roles: DESK, body: { type: 'object', properties: { date, staffIds: arrayOf(str) } }, ok: 201, returns: arrayOf(ref('Task')), errors: [400, 401, 403] }),
      },
      '/tasks/rebalance': {
        post: operation({ summary: 'Re-share open rounds across the staff on shift', tag: 'Care rounds', roles: DESK, body: { type: 'object', properties: { date, staffIds: arrayOf(str) } }, returns: arrayOf(ref('Task')), errors: [400, 401, 403] }),
      },
      '/tasks/{id}/assignee': {
        put: operation({ summary: 'Reassign a round', tag: 'Care rounds', roles: DESK, params: [idParam], body: { type: 'object', properties: { assigneeId: { type: ['string', 'null'] } } }, returns: ref('Task'), errors: [400, 401, 403, 404, 409] }),
      },
      '/tasks/{id}': {
        get: operation({ summary: 'One round with pet, room and contacts', tag: 'Care rounds', roles: 'the assignee, admin, receiving', params: [idParam], returns: ref('Task'), errors: [401, 403, 404] }),
        put: operation({ summary: 'Tick cleaned and fed', tag: 'Care rounds', roles: 'the assignee', params: [idParam], body: { type: 'object', properties: { cleaned: { type: 'boolean' }, fed: { type: 'boolean' } } }, returns: ref('Task'), errors: [400, 401, 403, 404, 409] }),
      },
      '/tasks/{id}/photo': {
        post: {
          ...operation({ summary: 'Upload the room photo (raw image body)', tag: 'Care rounds', roles: 'the assignee', params: [idParam], returns: ref('Task'), errors: [400, 401, 403, 404, 409] }),
          requestBody: { required: true, content: { 'image/jpeg': {}, 'image/png': {}, 'image/webp': {}, 'image/gif': {} } },
        },
      },
      '/tasks/{id}/complete': { post: operation({ summary: 'Complete a round (needs cleaned, fed and a photo)', tag: 'Care rounds', roles: 'the assignee', params: [idParam], returns: ref('Task'), errors: [400, 401, 403, 404, 409] }) },
      '/photos/{id}': { get: { ...operation({ summary: 'A room photo', tag: 'Care rounds', roles: ANY, params: [idParam], errors: [401, 404] }), responses: { 200: { description: 'The image', content: { 'image/*': {} } }, 401: ERRORS[401], 404: ERRORS[404] } } },
    },
  };
}
