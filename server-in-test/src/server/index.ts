import { resolve } from 'node:path';
import { createApp } from './app';
import { createRecordRepository } from './recordRepository';
import { DEFAULT_USERS } from './auth';
import { SEED_RECORDS } from './seed';
import { testRoutesEnabled } from './config';

const port = Number(process.env.PORT ?? 3000);
const clientDir = resolve(import.meta.dirname, '../../dist/client');

const enableTestRoutes = testRoutesEnabled(process.argv, process.env);

createApp({ repository: createRecordRepository(SEED_RECORDS), users: DEFAULT_USERS, clientDir, enableTestRoutes }).listen(port, () => {
  console.log(`server-in-test listening on http://localhost:${port}`);
  if (enableTestRoutes) console.log('test-support routes enabled: POST /api/test/reset, PUT /api/test/clock');
  console.log(`change the UI version with: PUT http://localhost:${port}/api/ui-version {"version": 2}`);
});
