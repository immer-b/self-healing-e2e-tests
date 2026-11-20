/** Calendar date in local time, `YYYY-MM-DD`. */
export type IsoDate = string;

const pad = (n: number) => String(n).padStart(2, '0');

export const toIsoDate = (date: Date): IsoDate =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const fromIsoDate = (iso: IsoDate) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toIsoDate(fromIsoDate(value)) === value; // rejects 2026-02-30 and friends
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = fromIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/**
 * The server's notion of "now". Injected everywhere that needs time so tests (and the e2e
 * test-support endpoint) can pin it.
 */
export function createClock(fixed?: Date) {
  let pinned = fixed ? new Date(fixed) : undefined;
  const now = () => (pinned ? new Date(pinned) : new Date());
  return {
    now,
    today: () => toIsoDate(now()),
    set: (date: Date | undefined) => {
      pinned = date ? new Date(date) : undefined;
    },
  };
}

export type Clock = ReturnType<typeof createClock>;
