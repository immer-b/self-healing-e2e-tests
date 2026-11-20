import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { Icon } from './components/Icon';
import { useToast } from './components/ui';
import { createOutbox, type QueuedWrite } from './outbox';

interface OfflineState {
  online: boolean;
  pending: number;
  /** Bumped after queued writes are synced, so pages can refetch. */
  syncVersion: number;
  /** Runs `direct` when possible; when offline (or the request can't get through) queues `write` and returns 'queued'. */
  submit: <T>(write: QueuedWrite, direct: () => Promise<T>) => Promise<T | 'queued'>;
}

const OfflineContext = createContext<OfflineState>({
  online: true,
  pending: 0,
  syncVersion: 0,
  submit: (_write, direct) => direct(),
});

export function OfflineProvider({ employeeId, children }: { employeeId: string; children: ReactNode }) {
  const toast = useToast();
  const outbox = useMemo(
    () => createOutbox({ send: (w) => api.raw(w.method, w.path, w.body), key: `hotel-outbox:${employeeId}` }),
    [employeeId],
  );
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(() => outbox.pending().length);
  const [syncVersion, setSyncVersion] = useState(0);

  const flush = useCallback(async () => {
    if (!outbox.pending().length) return;
    const { sent, failed } = await outbox.flush();
    setPending(outbox.pending().length);
    if (sent) toast(`Synced ${sent} ${sent === 1 ? 'change' : 'changes'}`);
    if (failed) toast(`${failed} offline ${failed === 1 ? 'change was' : 'changes were'} refused by the server`, 'danger');
    setSyncVersion((v) => v + 1);
  }, [outbox, toast]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (navigator.onLine) flush(); // anything left from a previous visit
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [flush]);

  const submit = useCallback(
    async <T,>(write: QueuedWrite, direct: () => Promise<T>): Promise<T | 'queued'> => {
      const queue = () => {
        outbox.queue(write);
        setPending(outbox.pending().length);
        return 'queued' as const;
      };
      if (!navigator.onLine) return queue();
      try {
        return await direct();
      } catch (error) {
        if (error instanceof TypeError) return queue();
        throw error;
      }
    },
    [outbox],
  );

  const value = useMemo(() => ({ online, pending, syncVersion, submit }), [online, pending, syncVersion, submit]);
  return (
    <OfflineContext.Provider value={value}>
      {(!online || pending > 0) && (
        <div className={`offline-banner ${online ? 'is-syncing' : ''}`} role="status">
          <Icon name={online ? 'restore' : 'alert'} />
          <span>
            {online
              ? 'Back online. Sending changes saved on this device…'
              : "You're offline. Checklist ticks and notes are saved on this device and sent when you reconnect."}
            {pending > 0 && <strong> {pending} {pending === 1 ? 'change' : 'changes'} waiting.</strong>}
          </span>
        </div>
      )}
      {children}
    </OfflineContext.Provider>
  );
}

export const useOffline = () => useContext(OfflineContext);
