import type {
  AuditEntry,
  CareSlot,
  Contact,
  Employee,
  EmployeeInput,
  Entity,
  FieldChange,
  Note,
  OwnerInput,
  PetInput,
  Role,
  RoomInput,
  RoomType,
  Species,
  StayInput,
  StayRecord,
  Task,
} from '../../server/hotel/types';

export type { AuditEntry, CareSlot, Contact, Employee, EmployeeInput, FieldChange, Note, OwnerInput, PetInput, Role, RoomInput, RoomType, Species, StayInput, Task };

export type Owner = Entity<OwnerInput> & { petCount?: number };
export type Room = Entity<RoomInput>;
export type OwnerSummary = { id: string; name: string; phone: string; deletedAt: string | null };
export type Pet = Entity<PetInput> & { owner?: OwnerSummary };
export type PetSummary = Pick<PetInput, 'name' | 'species' | 'breed' | 'specialInstructions'> & { id: string };
export type Stay = Entity<StayRecord> & {
  pet?: PetSummary;
  owner?: OwnerSummary;
  room?: { id: string; name: string; type: RoomType };
};
export type RoomOccupancy = Room & { occupied: boolean; stayId: string | null; petId: string | null; pet?: { id: string; name: string; species: Species } };
export type TaskDetail = Task & {
  pet?: PetSummary;
  room?: { id: string; name: string; type: RoomType };
  owner?: { id: string; name: string; contacts: Contact[] };
  assignee?: { id: string; name: string };
  overdue: boolean;
};
export type LabeledAuditEntry = AuditEntry & { label: string };

export interface Dashboard {
  date: string;
  arrivals: number;
  departures: number;
  inHouse: number;
  rooms: number;
  occupiedRooms: number;
  tasks: { total: number; completed: number; unassigned: number; overdue: number };
}

export interface ApiError extends Error {
  status: number;
  errors?: Record<string, string>;
}

/** Called when the server says the session is gone (expired, signed out elsewhere, account archived). */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

const BASE = '/api/hotel';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await requestWithHeaders<T>(path, init)).body;
}

async function requestWithHeaders<T>(path: string, init: RequestInit = {}): Promise<{ body: T; headers: Headers }> {
  const isBinary = init.body instanceof Blob;
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: isBinary || !init.body ? init.headers : { 'Content-Type': 'application/json', ...init.headers },
  });
  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
    const { error, errors } = (body ?? {}) as { error?: string; errors?: Record<string, string> };
    throw Object.assign(new Error(error ?? `Request failed (${response.status})`), { status: response.status, errors });
  }
  return { body: body as T, headers: response.headers };
}

const send = (method: string, data?: unknown): RequestInit => ({ method, body: data === undefined ? undefined : JSON.stringify(data) });
const query = (params: Record<string, string | boolean | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false);
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
};

type ListParams = { text?: string; includeDeleted?: boolean };

export const api = {
  login: (username: string, password: string) => request<{ employee: Employee }>('/auth/login', send('POST', { username, password })),
  logout: () => request<void>('/auth/logout', send('POST')),
  me: () => request<{ employee: Employee; today: string }>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ employee: Employee }>('/auth/password', send('POST', { currentPassword, newPassword })),

  employees: (params: ListParams = {}) => request<Employee[]>(`/employees${query(params)}`),
  staff: () => request<Employee[]>('/employees/staff'),
  createEmployee: (input: EmployeeInput & { password: string }) => request<Employee>('/employees', send('POST', input)),
  updateEmployee: (id: string, patch: Partial<EmployeeInput> & { password?: string }) => request<Employee>(`/employees/${id}`, send('PUT', patch)),
  archiveEmployee: (id: string) => request<Employee>(`/employees/${id}`, send('DELETE')),
  restoreEmployee: (id: string) => request<Employee>(`/employees/${id}/restore`, send('POST')),

  audit: async (params: { entityType?: string; entityId?: string; from?: string; to?: string; before?: string } = {}) => {
    const { body, headers } = await requestWithHeaders<LabeledAuditEntry[]>(`/audit${query(params)}`);
    return { entries: body, nextCursor: headers.get('X-Next-Cursor') ?? undefined };
  },

  rooms: (params: { includeDeleted?: boolean } = {}) => request<Room[]>(`/rooms${query(params)}`),
  availableRooms: (checkIn: string, checkOut: string) => request<Room[]>(`/rooms/available${query({ checkIn, checkOut })}`),
  occupancy: (date: string) => request<RoomOccupancy[]>(`/rooms/occupancy${query({ date })}`),
  createRoom: (input: RoomInput) => request<Room>('/rooms', send('POST', input)),
  updateRoom: (id: string, patch: Partial<RoomInput>) => request<Room>(`/rooms/${id}`, send('PUT', patch)),
  archiveRoom: (id: string) => request<Room>(`/rooms/${id}`, send('DELETE')),
  restoreRoom: (id: string) => request<Room>(`/rooms/${id}/restore`, send('POST')),

  owners: (params: ListParams = {}) => request<Owner[]>(`/owners${query(params)}`),
  owner: (id: string) => request<Owner>(`/owners/${id}`),
  duplicateOwners: ({ name, email, phones, excludeId }: { name: string; email: string; phones: string[]; excludeId?: string }) => {
    const params = new URLSearchParams({ name, email });
    phones.filter(Boolean).forEach((p) => params.append('phone', p));
    if (excludeId) params.set('excludeId', excludeId);
    return request<Owner[]>(`/owners/duplicates?${params}`);
  },
  createOwner: (input: OwnerInput) => request<Owner>('/owners', send('POST', input)),
  updateOwner: (id: string, patch: Partial<OwnerInput>) => request<Owner>(`/owners/${id}`, send('PUT', patch)),
  archiveOwner: (id: string) => request<Owner>(`/owners/${id}`, send('DELETE')),
  restoreOwner: (id: string) => request<Owner>(`/owners/${id}/restore`, send('POST')),

  pets: (params: ListParams & { ownerId?: string } = {}) => request<Pet[]>(`/pets${query(params)}`),
  pet: (id: string) => request<Pet>(`/pets/${id}`),
  createPet: (input: PetInput) => request<Pet>('/pets', send('POST', input)),
  updatePet: (id: string, patch: Partial<PetInput>) => request<Pet>(`/pets/${id}`, send('PUT', patch)),
  archivePet: (id: string) => request<Pet>(`/pets/${id}`, send('DELETE')),
  restorePet: (id: string) => request<Pet>(`/pets/${id}/restore`, send('POST')),
  petStays: (id: string) => request<Stay[]>(`/pets/${id}/stays`),
  notes: (petId: string) => request<Note[]>(`/pets/${petId}/notes`),
  addNote: (petId: string, text: string, taskId?: string, amends?: string) =>
    request<Note>(`/pets/${petId}/notes`, send('POST', { text, taskId, amends })),

  arrivals: (date: string) => request<Stay[]>(`/stays/arrivals${query({ date })}`),
  departures: (date: string) => request<Stay[]>(`/stays/departures${query({ date })}`),
  bookStay: (input: StayInput) => request<Stay>('/stays', send('POST', input)),
  checkIn: (id: string) => request<Stay>(`/stays/${id}/check-in`, send('POST')),
  checkOut: (id: string) => request<Stay>(`/stays/${id}/check-out`, send('POST')),
  cancelStay: (id: string) => request<Stay>(`/stays/${id}/cancel`, send('POST')),
  dashboard: (date: string) => request<Dashboard>(`/dashboard${query({ date })}`),

  board: (date: string) => request<TaskDetail[]>(`/tasks${query({ date })}`),
  myTasks: () => request<TaskDetail[]>('/tasks/mine'),
  task: (id: string) => request<TaskDetail>(`/tasks/${id}`),
  generateTasks: (date: string, staffIds: string[]) => request<Task[]>('/tasks/generate', send('POST', { date, staffIds })),
  rebalanceTasks: (date: string, staffIds: string[]) => request<Task[]>('/tasks/rebalance', send('POST', { date, staffIds })),
  reassignTask: (id: string, assigneeId: string | null) => request<Task>(`/tasks/${id}/assignee`, send('PUT', { assigneeId })),
  updateTask: (id: string, patch: { cleaned?: boolean; fed?: boolean }) => request<Task>(`/tasks/${id}`, send('PUT', patch)),
  uploadTaskPhoto: (id: string, file: Blob) =>
    request<Task>(`/tasks/${id}/photo`, { method: 'POST', body: file, headers: { 'Content-Type': file.type } }),
  completeTask: (id: string) => request<Task>(`/tasks/${id}/complete`, send('POST')),
};

export const photoUrl = (photoId: string) => `${BASE}/photos/${photoId}`;
