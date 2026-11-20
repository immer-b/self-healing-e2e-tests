import { describe, expect, it } from 'vitest';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';
import { validatePet } from '../../../src/server/hotel/validation';
import { vaccinationStatus } from '../../../src/server/hotel/petProfile';

const base = { name: 'Ziggy', species: 'cat', breed: 'Tabby', ownerId: 'own-1', specialInstructions: '' };

describe('pet profile validation', () => {
  it('fills optional profile fields with empty defaults', () => {
    expect(validatePet(base)).toEqual({
      ok: true,
      value: { ...base, dateOfBirth: '', weightLbs: null, vet: { name: '', phone: '' }, vaccinations: [] },
    });
  });

  it('accepts a full profile', () => {
    const result = validatePet({
      ...base,
      dateOfBirth: '2021-04-02',
      weightLbs: '11.5',
      vet: { name: 'Dr. Hannah Cole', phone: '(503) 555-0170' },
      vaccinations: [{ name: 'Rabies', expiresOn: '2027-04-01' }, { name: ' FVRCP ', expiresOn: '2026-12-01' }],
    });
    expect(result.ok && result.value).toMatchObject({
      weightLbs: 11.5,
      vaccinations: [{ name: 'Rabies', expiresOn: '2027-04-01' }, { name: 'FVRCP', expiresOn: '2026-12-01' }],
    });
  });

  it('reports bad profile values by path', () => {
    expect(
      validatePet({ ...base, dateOfBirth: 'last spring', weightLbs: -3, vet: { name: 'X', phone: '12' }, vaccinations: [{ name: '', expiresOn: 'soon' }] }),
    ).toEqual({
      ok: false,
      errors: {
        dateOfBirth: 'must be a date (YYYY-MM-DD)',
        weightLbs: 'must be a positive number',
        'vet.phone': 'must be a valid phone number',
        'vaccinations.0.name': 'is required',
        'vaccinations.0.expiresOn': 'must be a date (YYYY-MM-DD)',
      },
    });
  });
});

describe('vaccination status', () => {
  it('flags expired and soon-to-expire vaccinations relative to today', () => {
    const vaccinations = [
      { name: 'Rabies', expiresOn: '2026-11-19' },
      { name: 'Bordetella', expiresOn: '2026-12-10' },
      { name: 'DHPP', expiresOn: '2027-06-01' },
    ];
    expect(vaccinationStatus(vaccinations, '2026-11-20')).toEqual([
      { name: 'Rabies', expiresOn: '2026-11-19', status: 'expired' },
      { name: 'Bordetella', expiresOn: '2026-12-10', status: 'expiring' },
      { name: 'DHPP', expiresOn: '2027-06-01', status: 'current' },
    ]);
  });
});

describe('seeded profiles', () => {
  it('include vaccinations, including one that has lapsed', () => {
    const hotel = createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) });
    const biscuit = hotel.pets.get('pet-1')!;
    expect(biscuit.vaccinations!.length).toBeGreaterThan(0);
    const all = hotel.pets.list().flatMap((p) => vaccinationStatus(p.vaccinations ?? [], '2026-11-20'));
    expect(all.some((v) => v.status === 'expired')).toBe(true);
  });
});
