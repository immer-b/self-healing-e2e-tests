import { resolve } from 'node:path';
import { createApp } from './app';
import { createRecordRepository } from './recordRepository';
import { DEFAULT_USERS } from './auth';
import { SEED_RECORDS } from './seed';

const port = Number(process.env.PORT ?? 3000);
const clientDir = resolve(import.meta.dirname, '../../dist/client');

createApp({ repository: createRecordRepository(SEED_RECORDS), users: DEFAULT_USERS, clientDir }).listen(port, () => {
  console.log(`server-in-test listening on http://localhost:${port}`);
});
