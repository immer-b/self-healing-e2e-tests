import { useEffect, useRef } from 'react';

const DEBOUNCE_MS = 250;
const FALLBACK_POLL_MS = 30_000;

/**
 * Calls `onChange` when the server reports a change to one of `entityTypes` (Server-Sent Events
 * from /api/hotel/events). Bursts are debounced into one refetch. Browsers without EventSource
 * fall back to polling every 30 seconds.
 */
export function useLiveUpdates(entityTypes: readonly string[], onChange: () => void) {
  const callback = useRef(onChange);
  callback.current = onChange;
  const types = entityTypes.join(',');

  useEffect(() => {
    const wanted = new Set(types.split(','));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => callback.current(), DEBOUNCE_MS);
    };

    if (typeof EventSource === 'undefined') {
      const poll = setInterval(() => callback.current(), FALLBACK_POLL_MS);
      return () => clearInterval(poll);
    }
    const source = new EventSource('/api/hotel/events');
    source.addEventListener('change', (event) => {
      try {
        const { entityType } = JSON.parse((event as MessageEvent).data) as { entityType: string };
        if (wanted.has(entityType)) schedule();
      } catch {
        // ignore malformed events
      }
    });
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [types]);
}
