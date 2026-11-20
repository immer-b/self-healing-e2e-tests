import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { ElementStore } from './types';

export interface StoreServerOptions {
  /** When set, requests must send `Authorization: Bearer <token>`. */
  token?: string;
}

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
};

const send = (res: ServerResponse, status: number, body?: unknown) => {
  res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};

/**
 * Exposes any ElementStore over HTTP so a whole team / CI fleet can share fingerprints.
 * Back it with a filesystem or document (MongoDB) store for persistence.
 */
export function createStoreServer(store: ElementStore, { token }: StoreServerOptions = {}) {
  return createServer(async (req, res) => {
    try {
      if (token && req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: 'Unauthorized' });

      const { pathname } = new URL(req.url ?? '/', 'http://localhost');
      const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const method = req.method ?? 'GET';

      if (parts.length === 1 && parts[0] === 'pages' && method === 'GET') return send(res, 200, await store.listPages());

      if (parts.length >= 3 && parts[0] === 'pages' && parts[2] === 'elements') {
        const pageId = parts[1];
        if (parts.length === 3 && method === 'GET') return send(res, 200, await store.listElements(pageId));

        const elementKey = parts.slice(3).join('/');
        if (method === 'GET') {
          const record = await store.get(pageId, elementKey);
          return record ? send(res, 200, record) : send(res, 404, { error: 'Not found' });
        }
        if (method === 'PUT') {
          await store.put({ ...(await readBody(req)), pageId, elementKey });
          return send(res, 204);
        }
        if (method === 'DELETE') return send(res, (await store.remove(pageId, elementKey)) ? 204 : 404);
      }
      send(res, 404, { error: 'Not found' });
    } catch (error) {
      send(res, 500, { error: (error as Error).message });
    }
  });
}
