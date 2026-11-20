import type { Entity } from './entityStore';
import type { IsoDate } from './clock';

export type { Actor, AuditEntry, FieldChange } from './auditLog';
export type { Entity } from './entityStore';
export type { IsoDate } from './clock';

/** Permission level. Admins manage staff and see change logs; receiving runs the front desk; staff do care rounds. */
export const ROLES = ['admin', 'receiving', 'staff'] as const;
export type Role = (typeof ROLES)[number];

/** Job category, independent of permissions. */
export const EMPLOYEE_TYPES = ['front_desk', 'maintenance'] as const;
export type EmployeeType = (typeof EMPLOYEE_TYPES)[number];

export interface EmployeeInput {
  name: string;
  username: string;
  email: string;
  phone: string;
  role: Role;
  type: EmployeeType;
}

export interface EmployeeRecord extends EmployeeInput {
  passwordHash: string;
}

/** What the API returns: never includes the password hash. */
export type Employee = Entity<EmployeeInput>;

export const ROOM_TYPES = ['exclusive', 'midline', 'basic'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export interface RoomInput {
  name: string;
  type: RoomType;
  nightlyRate: number;
}
export type Room = Entity<RoomInput>;

export interface Phone {
  label: string;
  number: string;
}

export interface Contact {
  name: string;
  relationship: string;
  phones: Phone[];
}

export interface Address {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface OwnerInput {
  name: string;
  email: string;
  address: Address;
  contacts: Contact[];
}
export type Owner = Entity<OwnerInput>;

export const SPECIES = ['dog', 'cat', 'other'] as const;
export type Species = (typeof SPECIES)[number];

export interface PetInput {
  name: string;
  species: Species;
  breed: string;
  ownerId: string;
  /** Standing instructions shown to staff on every care task (diet, medication, temperament). */
  specialInstructions: string;
}
export type Pet = Entity<PetInput>;

export const STAY_STATUSES = ['booked', 'checked_in', 'checked_out', 'cancelled'] as const;
export type StayStatus = (typeof STAY_STATUSES)[number];

export interface StayInput {
  petId: string;
  roomId: string;
  checkIn: IsoDate;
  checkOut: IsoDate;
}

export interface StayRecord extends StayInput {
  status: StayStatus;
}
export type Stay = Entity<StayRecord>;

/** Notes are append-only for legal record keeping: they can never be edited or deleted. */
export interface NoteRecord {
  petId: string;
  text: string;
  taskId: string | null;
}
export type Note = Entity<NoteRecord>;

export const CARE_SLOTS = ['morning', 'evening'] as const;
export type CareSlot = (typeof CARE_SLOTS)[number];

export const TASK_STATUSES = ['pending', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** One care round for one pet: clean the room and feed, then complete with a photo. */
export interface TaskRecord {
  date: IsoDate;
  slot: CareSlot;
  petId: string;
  stayId: string;
  roomId: string;
  assigneeId: string | null;
  cleaned: boolean;
  fed: boolean;
  photoId: string | null;
  status: TaskStatus;
  completedAt: string | null;
}
export type Task = Entity<TaskRecord>;
