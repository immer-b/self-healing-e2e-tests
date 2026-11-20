import { addDays, type IsoDate } from './clock';
import type { Vaccination } from './types';

export const EXPIRING_WITHIN_DAYS = 30;

export type VaccinationStatus = 'expired' | 'expiring' | 'current';

/** Flags each vaccination as expired, expiring within 30 days, or current. Informational only: check-in is not blocked. */
export function vaccinationStatus(vaccinations: readonly Vaccination[], today: IsoDate) {
  const soon = addDays(today, EXPIRING_WITHIN_DAYS);
  return vaccinations.map((v) => ({
    ...v,
    status: (v.expiresOn < today ? 'expired' : v.expiresOn <= soon ? 'expiring' : 'current') as VaccinationStatus,
  }));
}
