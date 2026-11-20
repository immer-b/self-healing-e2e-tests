import { resolve } from 'node:path';
import { createApp } from './app';
import { createRecordRepository } from './recordRepository';
import { DEFAULT_USERS } from './auth';
import { SEED_RECORDS } from './seed';
import { parseServerConfig } from './config';

const { port, uiVersion } = parseServerConfig(process.argv.slice(2), process.env);
const clientDir = resolve(import.meta.dirname, '../../dist/client');

createApp({ repository: createRecordRepository(SEED_RECORDS), users: DEFAULT_USERS, clientDir, uiVersion }).listen(port, () => {
  console.log(`server-in-test listening on http://localhost:${port} (default UI version ${uiVersion})`);
});
