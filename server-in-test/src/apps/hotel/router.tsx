import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/** Minimal history-API router for the /hotel/ single page app. */
export const BASE_PATH = '/hotel';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
};

const appPath = () => {
  const { pathname } = window.location;
  const path = pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) : pathname;
  return path.replace(/\/+$/, '') || '/';
};

export function navigate(to: string, { replace = false } = {}) {
  const url = `${BASE_PATH}${to === '/' ? '/' : to}`;
  if (url === window.location.pathname + window.location.search) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
  notify();
}

/** The current path inside the app, e.g. "/pets/pet-3". */
export const usePath = () => useSyncExternalStore(subscribe, appPath);

/** `matchPath('/pets/:id', '/pets/pet-3')` -> `{ id: 'pet-3' }`, or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    else if (patternParts[i] !== pathParts[i]) return null;
  }
  return params;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; activePrefix?: boolean };

export function Link({ to, activePrefix = false, onClick, children, ...rest }: LinkProps) {
  const path = usePath();
  const active = activePrefix ? path === to || path.startsWith(`${to}/`) : path === to;
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={`${BASE_PATH}${to}`} aria-current={active ? 'page' : undefined} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
