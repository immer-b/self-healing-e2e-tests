/**
 * Runs a shared element store service backed by the filesystem.
 *   PORT=4400 HEALING_STORE_DIR=/data/healing HEALING_STORE_TOKEN=secret npm run store:serve
 * Point test runs at it with HEALING_STORE=remote HEALING_STORE_URL=http://host:4400.
 */
import { createFileSystemStore } from './fileSystemStore';
import { createStoreServer } from './storeServer';
import { DEFAULT_STORE_DIR } from './createStore';

const port = Number(process.env.PORT ?? 4400);
const dir = process.env.HEALING_STORE_DIR ?? DEFAULT_STORE_DIR;

createStoreServer(createFileSystemStore({ dir }), { token: process.env.HEALING_STORE_TOKEN }).listen(port, () => {
  console.log(`element store listening on http://localhost:${port} (data in ${dir})`);
});
