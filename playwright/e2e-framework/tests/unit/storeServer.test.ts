import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createStoreServer } from '../../src/store/storeServer';
import { createMemoryStore } from '../../src/store/memoryStore';
import { createRemoteStore } from '../../src/store/remoteStore';

let server: Server;
const start = async (token?: string) => {
  server = createStoreServer(createMemoryStore(), { token });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('store server authentication', () => {
  it('rejects requests without the configured bearer token', async () => {
    const url = await start('s3cret');
    expect((await fetch(`${url}/pages`)).status).toBe(401);
    await expect(createRemoteStore({ baseUrl: url, token: 'wrong' }).listPages()).rejects.toThrow(/401/);
  });

  it('accepts requests with the token', async () => {
    const url = await start('s3cret');
    expect(await createRemoteStore({ baseUrl: url, token: 's3cret' }).listPages()).toEqual([]);
  });

  it('returns 404 for unknown routes', async () => {
    const url = await start();
    expect((await fetch(`${url}/nope`)).status).toBe(404);
  });
});
