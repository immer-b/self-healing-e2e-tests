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

/** Calendar parts of `date` in `timeZone` (an IANA name), or in local time when no zone is given. */
function partsIn(date: Date, timeZone?: string) {
  if (!timeZone) return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate(), h: date.getHours(), min: date.getMinutes() };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)]),
  );
  return { y: parts.year, m: parts.month, d: parts.day, h: parts.hour, min: parts.minute };
}

/**
 * The server's notion of "now". Injected everywhere that needs time so tests (and the e2e
 * test-support endpoint) can pin it. `timeZone` is the hotel's IANA zone; without one the
 * machine's local time is used (what the unit tests rely on).
 */
export function createClock(fixed?: Date, timeZone?: string) {
  if (timeZone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
    } catch {
      throw new Error(`Unknown time zone: ${timeZone}`);
    }
  }
  let pinned = fixed ? new Date(fixed) : undefined;
  const now = () => (pinned ? new Date(pinned) : new Date());
  const dateOf = (date: Date): IsoDate => {
    const { y, m, d } = partsIn(date, timeZone);
    return `${y}-${pad(m)}-${pad(d)}`;
  };
  return {
    now,
    timeZone,
    today: (): IsoDate => dateOf(now()),
    /** The hotel calendar date of any instant. */
    dateOf: (instant: Date | string) => dateOf(new Date(instant)),
    /** Minutes since midnight in the hotel's time zone. */
    minutesIntoDay: () => {
      const { h, min } = partsIn(now(), timeZone);
      return h * 60 + min;
    },
    set: (date: Date | undefined) => {
      pinned = date ? new Date(date) : undefined;
    },
  };
}

export type Clock = ReturnType<typeof createClock>;
