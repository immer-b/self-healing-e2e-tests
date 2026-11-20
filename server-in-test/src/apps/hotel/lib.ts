import { useCallback, useEffect, useRef, useState } from 'react';
import type { CareSlot, Role, RoomType, Species } from './api';
import type { Tone } from './components/ui';

/* ---------------- labels ---------------- */

export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', receiving: 'Front desk', staff: 'General staff' };
export const EMPLOYEE_TYPE_LABELS = { front_desk: 'Front desk', maintenance: 'Maintenance' } as const;
export const ROOM_TYPE_LABELS: Record<RoomType, string> = { exclusive: 'Exclusive suite', midline: 'Midline room', basic: 'Basic kennel' };
export const SPECIES_LABELS: Record<Species, string> = { dog: 'Dog', cat: 'Cat', other: 'Other' };
export const SLOT_LABELS: Record<CareSlot, string> = { morning: 'Morning', evening: 'Evening' };
export const SLOT_TIMES: Record<CareSlot, string> = { morning: '8:00 AM', evening: '5:00 PM' };

export const STAY_STATUS: Record<string, { label: string; tone: Tone }> = {
  booked: { label: 'Expected', tone: 'info' },
  checked_in: { label: 'Checked in', tone: 'success' },
  checked_out: { label: 'Checked out', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export const ROOM_TONE: Record<RoomType, Tone> = { exclusive: 'accent', midline: 'info', basic: 'neutral' };

export const toOptions = <K extends string>(labels: Record<K, string>) =>
  (Object.entries(labels) as [K, string][]).map(([value, label]) => ({ value, label }));

/* ---------------- dates ---------------- */

const parseDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const formatDate = (iso: string) =>
  parseDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export const formatLongDate = (iso: string) =>
  parseDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export const formatDateTime = (isoInstant: string) =>
  new Date(isoInstant).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const addDays = (iso: string, days: number) => {
  const date = parseDate(iso);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const nights = (checkIn: string, checkOut: string) =>
  Math.round((parseDate(checkOut).getTime() - parseDate(checkIn).getTime()) / 86_400_000);

export const formatMoney = (amount: number) =>
  amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: amount % 1 ? 2 : 0 });

/* ---------------- data loading ---------------- */

/** Loads data with `loader` whenever `deps` change; `reload` refetches without flashing a spinner. */
export function useResource<T>(loader: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const load = useCallback(loader, deps); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async () => {
    const call = ++latest.current;
    try {
      const value = await load();
      if (call === latest.current) {
        setData(value);
        setError(undefined);
      }
    } catch (e) {
      if (call === latest.current) setError((e as Error).message);
    } finally {
      if (call === latest.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    setLoading(true);
    run();
  }, [run]);

  return { data, error, loading, reload: run, setData };
}

/** Turns an API error's `{ errors }` into per-field messages, falling back to a general message. */
export function fieldErrors(error: unknown): { general?: string; fields: Record<string, string> } {
  const { message, errors } = error as { message?: string; errors?: Record<string, string> };
  if (errors && Object.keys(errors).length) {
    const fields = Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, `${humanize(k)} ${v}`]));
    return { fields, general: undefined };
  }
  return { general: message ?? 'Something went wrong', fields: {} };
}

const FIELD_NAMES: Record<string, string> = {
  ownerId: 'Owner',
  roomId: 'Room',
  petId: 'Pet',
  checkIn: 'Check-in',
  checkOut: 'Check-out',
  nightlyRate: 'Nightly rate',
  postalCode: 'ZIP code',
  line1: 'Street address',
  specialInstructions: 'Special instructions',
  assigneeId: 'Assignee',
  staffIds: 'Staff',
  number: 'Phone number',
};

export function humanize(path: string) {
  const last = path.split('.').filter((p) => !/^\d+$/.test(p)).pop() ?? path;
  if (FIELD_NAMES[last]) return FIELD_NAMES[last];
  const spaced = last.replace(/([A-Z])/g, ' $1').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
