import type { ElementRecord } from '../fingerprint/types';
import type { ElementStore } from './types';

export interface RemoteStoreOptions {
  /** Base URL of a store server (see storeServer.ts) or any service implementing the same REST contract. */
  baseUrl: string;
  /** Optional bearer token sent as `Authorization: Bearer <token>`. */
  token?: string;
}

/**
 * REST contract:
 *   GET    /pages                          -> string[]
 *   GET    /pages/:pageId/elements         -> ElementRecord[]
 *   GET    /pages/:pageId/elements/:key    -> ElementRecord | 404
 *   PUT    /pages/:pageId/elements/:key    <- ElementRecord
 *   DELETE /pages/:pageId/elements/:key    -> 204 | 404
 */
export function createRemoteStore({ baseUrl, token }: RemoteStoreOptions): ElementStore {
  const root = baseUrl.replace(/\/$/, '');
  const elementUrl = (pageId: string, key: string) =>
    `${root}/pages/${encodeURIComponent(pageId)}/elements/${encodeURIComponent(key)}`;

  const call = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Element store request failed: ${init.method ?? 'GET'} ${url} -> ${response.status}`);
    }
    return response;
  };

  return {
    async get(pageId, elementKey) {
      const response = await call(elementUrl(pageId, elementKey));
      return response.status === 404 ? undefined : ((await response.json()) as ElementRecord);
    },
    async put(record) {
      await call(elementUrl(record.pageId, record.elementKey), { method: 'PUT', body: JSON.stringify(record) });
    },
    async listPages() {
      return (await call(`${root}/pages`)).json();
    },
    async listElements(pageId) {
      return (await call(`${root}/pages/${encodeURIComponent(pageId)}/elements`)).json();
    },
    async remove(pageId, elementKey) {
      return (await call(elementUrl(pageId, elementKey), { method: 'DELETE' })).status !== 404;
    },
  };
}
