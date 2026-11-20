import { isIsoDate } from './clock';
import {
  EMPLOYEE_TYPES,
  ROLES,
  ROOM_TYPES,
  SPECIES,
  type Address,
  type Contact,
  type EmployeeInput,
  type OwnerInput,
  type PetInput,
  type RoomInput,
  type StayInput,
} from './types';

export type Errors = Record<string, string>;
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Errors };

type Check = { value?: unknown; error?: string; errors?: Errors };
type FieldValidator = (raw: unknown) => Check;

const text = (raw: unknown) => (typeof raw === 'string' ? raw.trim() : '');

const requiredText: FieldValidator = (raw) => (text(raw) ? { value: text(raw) } : { error: 'is required' });
const optionalText: FieldValidator = (raw) => ({ value: text(raw) });

const oneOf =
  (allowed: readonly string[]): FieldValidator =>
  (raw) =>
    allowed.includes(raw as string) ? { value: raw } : { error: `must be one of ${allowed.join(', ')}` };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const optionalEmail: FieldValidator = (raw) =>
  !text(raw) || EMAIL.test(text(raw)) ? { value: text(raw) } : { error: 'must be a valid email address' };

const PHONE_CHARS = /^[+\d\s().-]+$/;
const isPhone = (value: string) => PHONE_CHARS.test(value) && value.replace(/\D/g, '').length >= 7;
const optionalPhone: FieldValidator = (raw) =>
  !text(raw) || isPhone(text(raw)) ? { value: text(raw) } : { error: 'must be a valid phone number' };

const nonNegativeNumber: FieldValidator = (raw) => {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? { value }
    : { error: 'must be a non-negative number' };
};

const isoDate: FieldValidator = (raw) => (isIsoDate(raw) ? { value: raw } : { error: 'must be a date (YYYY-MM-DD)' });

const prefixErrors = (prefix: string, errors: Errors) =>
  Object.fromEntries(Object.entries(errors).map(([k, v]) => [`${prefix}.${k}`, v]));

/** Runs field validators; nested validators may return `errors` keyed by sub-path. */
function validateFields<T>(
  body: unknown,
  validators: Record<string, FieldValidator>,
  partial: boolean,
): ValidationResult<T> {
  const input = (body ?? {}) as Record<string, unknown>;
  const value: Record<string, unknown> = {};
  const errors: Errors = {};
  for (const [field, validate] of Object.entries(validators)) {
    if (partial && input[field] === undefined) continue;
    const result = validate(input[field]);
    if (result.error) errors[field] = result.error;
    else if (result.errors) Object.assign(errors, prefixErrors(field, result.errors));
    else value[field] = result.value;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: value as T };
}

const nested =
  <T>(validators: Record<string, FieldValidator>): FieldValidator =>
  (raw) => {
    const result = validateFields<T>(raw, validators, false);
    return result.ok ? { value: result.value } : { errors: result.errors };
  };

type Options = { partial?: boolean };

/* ---------- employees ---------- */

const USERNAME = /^[a-z0-9._-]{3,32}$/;

const EMPLOYEE_FIELDS: Record<keyof EmployeeInput, FieldValidator> = {
  name: requiredText,
  username: (raw) =>
    USERNAME.test(text(raw))
      ? { value: text(raw) }
      : { error: 'must be 3-32 lowercase letters, digits, dots, dashes or underscores' },
  email: optionalEmail,
  phone: optionalPhone,
  role: oneOf(ROLES),
  type: oneOf(EMPLOYEE_TYPES),
};

export function validateEmployee(body: unknown, options: { partial: true }): ValidationResult<Partial<EmployeeInput>>;
export function validateEmployee(body: unknown, options?: Options): ValidationResult<EmployeeInput>;
export function validateEmployee(body: unknown, { partial = false }: Options = {}) {
  return validateFields<EmployeeInput>(body, EMPLOYEE_FIELDS, partial);
}

export const validatePassword = (raw: unknown): string | undefined =>
  typeof raw === 'string' && raw.length >= 8 ? undefined : 'must be at least 8 characters';

/* ---------- rooms ---------- */

const ROOM_FIELDS: Record<keyof RoomInput, FieldValidator> = {
  name: requiredText,
  type: oneOf(ROOM_TYPES),
  nightlyRate: nonNegativeNumber,
};

export function validateRoom(body: unknown, options: { partial: true }): ValidationResult<Partial<RoomInput>>;
export function validateRoom(body: unknown, options?: Options): ValidationResult<RoomInput>;
export function validateRoom(body: unknown, { partial = false }: Options = {}) {
  return validateFields<RoomInput>(body, ROOM_FIELDS, partial);
}

/* ---------- owners ---------- */

const ADDRESS_FIELDS: Record<keyof Address, FieldValidator> = {
  line1: requiredText,
  line2: optionalText,
  city: requiredText,
  state: requiredText,
  postalCode: requiredText,
};

const phones: FieldValidator = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'must include at least one phone number' };
  const errors: Errors = {};
  const value = raw.map((phone, i) => {
    const number = text(phone?.number);
    if (!isPhone(number)) errors[`${i}.number`] = 'must be a valid phone number';
    return { label: text(phone?.label) || 'Phone', number };
  });
  return Object.keys(errors).length ? { errors } : { value };
};

const CONTACT_FIELDS: Record<keyof Contact, FieldValidator> = {
  name: requiredText,
  relationship: requiredText,
  phones,
};

const contacts: FieldValidator = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'must include at least one contact' };
  const errors: Errors = {};
  const value = raw.map((contact, i) => {
    const result = validateFields<Contact>(contact, CONTACT_FIELDS, false);
    if (!result.ok) Object.assign(errors, prefixErrors(String(i), result.errors));
    return result.ok ? result.value : undefined;
  });
  return Object.keys(errors).length ? { errors } : { value };
};

const OWNER_FIELDS: Record<keyof OwnerInput, FieldValidator> = {
  name: requiredText,
  email: optionalEmail,
  address: nested<Address>(ADDRESS_FIELDS),
  contacts,
};

export function validateOwner(body: unknown, options: { partial: true }): ValidationResult<Partial<OwnerInput>>;
export function validateOwner(body: unknown, options?: Options): ValidationResult<OwnerInput>;
export function validateOwner(body: unknown, { partial = false }: Options = {}) {
  return validateFields<OwnerInput>(body, OWNER_FIELDS, partial);
}

/* ---------- pets ---------- */

const PET_FIELDS: Record<keyof PetInput, FieldValidator> = {
  name: requiredText,
  species: oneOf(SPECIES),
  breed: requiredText,
  ownerId: requiredText,
  specialInstructions: optionalText,
};

export function validatePet(body: unknown, options: { partial: true }): ValidationResult<Partial<PetInput>>;
export function validatePet(body: unknown, options?: Options): ValidationResult<PetInput>;
export function validatePet(body: unknown, { partial = false }: Options = {}) {
  return validateFields<PetInput>(body, PET_FIELDS, partial);
}

/* ---------- stays ---------- */

const STAY_FIELDS: Record<keyof StayInput, FieldValidator> = {
  petId: requiredText,
  roomId: requiredText,
  checkIn: isoDate,
  checkOut: isoDate,
};

export function validateStay(body: unknown): ValidationResult<StayInput> {
  const result = validateFields<StayInput>(body, STAY_FIELDS, false);
  if (result.ok && result.value.checkOut <= result.value.checkIn) {
    return { ok: false, errors: { checkOut: 'must be after check-in' } };
  }
  return result;
}

/* ---------- notes ---------- */

export const MAX_NOTE_LENGTH = 2000;

export function validateNote(body: unknown): ValidationResult<{ text: string }> {
  const value = text((body as { text?: unknown } | undefined)?.text);
  if (!value) return { ok: false, errors: { text: 'is required' } };
  if (value.length > MAX_NOTE_LENGTH) return { ok: false, errors: { text: `must be at most ${MAX_NOTE_LENGTH} characters` } };
  return { ok: true, value: { text: value } };
}
