/**
 * Offline outbox for the writes a carer makes mid-round: checklist ticks and notes. When the
 * device is offline (or the request can't reach the server) the write is kept in localStorage
 * and sent, in order, when the connection returns. Photos and completing a round still need a
 * connection: photos are large and completion needs the server's checks.
 */

export interface QueuedWrite {
  method: string;
  path: string;
  body: unknown;
  queuedAt?: string;
}

export type Submitted = 'sent' | 'queued';

export const isQueueable = (method: string, path: string) =>
  (method === 'PUT' && /^\/api\/hotel\/tasks\/[\w-]+$/.test(path)) || (method === 'POST' && /^\/api\/hotel\/pets\/[\w-]+\/notes$/.test(path));

/** fetch rejects with a TypeError when the request never reached a server. */
const isNetworkFailure = (error: unknown) => error instanceof TypeError;

export function createOutbox({
  send,
  isOnline = () => navigator.onLine,
  key = 'hotel-outbox',
}: {
  send: (write: QueuedWrite) => Promise<unknown>;
  isOnline?: () => boolean;
  /** Per-employee key, so a different person signing in on the device never sends someone else's writes. */
  key?: string;
}) {
  const read = (): QueuedWrite[] => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]');
    } catch {
      return [];
    }
  };
  const write = (list: QueuedWrite[]) => {
    try {
      if (list.length) localStorage.setItem(key, JSON.stringify(list));
      else localStorage.removeItem(key);
    } catch {
      // storage unavailable: the write is lost, but the page keeps working
    }
  };
  const enqueue = (item: QueuedWrite) => write([...read(), { ...item, queuedAt: new Date().toISOString() }]);

  return {
    pending: read,
    /** Queue without trying to send (the caller already knows it is offline). */
    queue: enqueue,
    submit: async (item: QueuedWrite): Promise<Submitted> => {
      if (!isOnline()) {
        enqueue(item);
        return 'queued';
      }
      try {
        await send(item);
        return 'sent';
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        enqueue(item);
        return 'queued';
      }
    },
    /** Sends queued writes in order. Stops at the first network failure; drops writes the server rejects. */
    flush: async () => {
      const list = read();
      let sent = 0;
      let failed = 0;
      for (let i = 0; i < list.length; i++) {
        try {
          await send(list[i]);
          sent++;
        } catch (error) {
          if (isNetworkFailure(error)) {
            write(list.slice(i));
            return { sent, failed };
          }
          failed++;
        }
      }
      write([]);
      return { sent, failed };
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
