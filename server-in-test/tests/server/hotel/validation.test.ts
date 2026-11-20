import { describe, expect, it } from 'vitest';
import {
  validateEmployee,
  validateNote,
  validateOwner,
  validatePassword,
  validatePet,
  validateRoom,
  validateStay,
} from '../../../src/server/hotel/validation';

const validOwner = {
  name: 'Dana Whitfield',
  email: 'dana@example.com',
  address: { line1: '12 Elm St', line2: '', city: 'Portland', state: 'OR', postalCode: '97201' },
  contacts: [
    { name: 'Dana Whitfield', relationship: 'Owner', phones: [{ label: 'Mobile', number: '(503) 555-0101' }] },
    {
      name: 'Sam Whitfield',
      relationship: 'Spouse',
      phones: [
        { label: 'Mobile', number: '+1 503 555 0102' },
        { label: 'Work', number: '503-555-0199' },
      ],
    },
  ],
};

describe('employee validation', () => {
  const valid = { name: ' Jordan Lee ', username: 'jordan', email: 'jordan@willowpets.test', phone: '', role: 'staff', type: 'maintenance' };

  it('accepts and trims a valid employee', () => {
    expect(validateEmployee(valid)).toEqual({
      ok: true,
      value: { name: 'Jordan Lee', username: 'jordan', email: 'jordan@willowpets.test', phone: '', role: 'staff', type: 'maintenance' },
    });
  });

  it('reports every invalid field', () => {
    const result = validateEmployee({ name: '', username: 'A B', email: 'nope', role: 'boss', type: 'chef' });
    expect(result).toEqual({
      ok: false,
      errors: {
        name: 'is required',
        username: 'must be 3-32 lowercase letters, digits, dots, dashes or underscores',
        email: 'must be a valid email address',
        role: 'must be one of admin, receiving, staff',
        type: 'must be one of front_desk, maintenance',
      },
    });
  });

  it('validates only supplied fields in partial mode', () => {
    expect(validateEmployee({ role: 'receiving' }, { partial: true })).toEqual({ ok: true, value: { role: 'receiving' } });
  });

  it('requires passwords of at least 8 characters', () => {
    expect(validatePassword('short')).toBe('must be at least 8 characters');
    expect(validatePassword(undefined)).toBe('must be at least 8 characters');
    expect(validatePassword('longenough')).toBeUndefined();
  });
});

describe('room validation', () => {
  it('accepts a room and coerces the nightly rate', () => {
    expect(validateRoom({ name: 'E-101', type: 'exclusive', nightlyRate: '89.5' })).toEqual({
      ok: true,
      value: { name: 'E-101', type: 'exclusive', nightlyRate: 89.5 },
    });
  });

  it('rejects unknown types and negative rates', () => {
    expect(validateRoom({ name: 'X', type: 'penthouse', nightlyRate: -1 })).toEqual({
      ok: false,
      errors: { type: 'must be one of exclusive, midline, basic', nightlyRate: 'must be a non-negative number' },
    });
  });
});

describe('owner validation', () => {
  it('accepts a full owner with several contacts and phone numbers', () => {
    const result = validateOwner(validOwner);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.contacts[1].phones).toHaveLength(2);
  });

  it('requires a usable address', () => {
    const result = validateOwner({ ...validOwner, address: { line1: '', city: '', state: 'OR', postalCode: '' } });
    expect(result).toEqual({
      ok: false,
      errors: { 'address.line1': 'is required', 'address.city': 'is required', 'address.postalCode': 'is required' },
    });
  });

  it('requires at least one contact, each with a name, relationship and phone', () => {
    expect(validateOwner({ ...validOwner, contacts: [] })).toEqual({
      ok: false,
      errors: { contacts: 'must include at least one contact' },
    });
    const result = validateOwner({
      ...validOwner,
      contacts: [{ name: '', relationship: '', phones: [] }, { name: 'B', relationship: 'Friend', phones: [{ label: 'Home', number: '12' }] }],
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        'contacts.0.name': 'is required',
        'contacts.0.relationship': 'is required',
        'contacts.0.phones': 'must include at least one phone number',
        'contacts.1.phones.0.number': 'must be a valid phone number',
      },
    });
  });

  it('allows an empty email but rejects a malformed one', () => {
    expect(validateOwner({ ...validOwner, email: '' }).ok).toBe(true);
    expect(validateOwner({ ...validOwner, email: 'dana@' })).toEqual({ ok: false, errors: { email: 'must be a valid email address' } });
  });

  it('defaults a missing phone label', () => {
    const result = validateOwner({
      ...validOwner,
      contacts: [{ name: 'A', relationship: 'Owner', phones: [{ number: '5035550101' }] }],
    });
    expect(result.ok && result.value.contacts[0].phones[0]).toEqual({ label: 'Phone', number: '5035550101' });
  });
});

describe('pet validation', () => {
  it('accepts a pet', () => {
    expect(validatePet({ name: 'Biscuit', species: 'dog', breed: 'Beagle', ownerId: 'own-1', specialInstructions: '' })).toEqual({
      ok: true,
      value: {
        name: 'Biscuit', species: 'dog', breed: 'Beagle', ownerId: 'own-1', specialInstructions: '',
        dateOfBirth: '', weightLbs: null, vet: { name: '', phone: '' }, vaccinations: [],
      },
    });
  });

  it('requires name, breed and owner', () => {
    expect(validatePet({ species: 'lizard' })).toEqual({
      ok: false,
      errors: { name: 'is required', species: 'must be one of dog, cat, other', breed: 'is required', ownerId: 'is required' },
    });
  });
});

describe('stay validation', () => {
  it('accepts a stay whose check-out is after check-in', () => {
    expect(validateStay({ petId: 'pet-1', roomId: 'room-1', checkIn: '2026-11-20', checkOut: '2026-11-22' })).toEqual({
      ok: true,
      value: { petId: 'pet-1', roomId: 'room-1', checkIn: '2026-11-20', checkOut: '2026-11-22' },
    });
  });

  it('rejects invalid dates and reversed ranges', () => {
    expect(validateStay({ petId: 'p', roomId: 'r', checkIn: '2026-13-01', checkOut: '2026-11-22' })).toEqual({
      ok: false,
      errors: { checkIn: 'must be a date (YYYY-MM-DD)' },
    });
    expect(validateStay({ petId: 'p', roomId: 'r', checkIn: '2026-11-22', checkOut: '2026-11-22' })).toEqual({
      ok: false,
      errors: { checkOut: 'must be after check-in' },
    });
  });
});

describe('note validation', () => {
  it('trims text and limits its length', () => {
    expect(validateNote({ text: '  Slight limp on left hind leg.  ' })).toEqual({ ok: true, value: { text: 'Slight limp on left hind leg.' } });
    expect(validateNote({ text: '   ' })).toEqual({ ok: false, errors: { text: 'is required' } });
    expect(validateNote({ text: 'x'.repeat(2001) })).toEqual({ ok: false, errors: { text: 'must be at most 2000 characters' } });
  });
});
