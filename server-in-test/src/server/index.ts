import { resolve } from 'node:path';
import { createApp } from './app';
import { createRecordRepository } from './recordRepository';
import { DEFAULT_USERS } from './auth';
import { SEED_RECORDS } from './seed';
import { hotelStorage, hotelTimeZone, testRoutesEnabled } from './config';
import { createSqlitePersistence } from './hotel/persistence';
import { createClock } from './hotel/clock';
import { createHotel } from './hotel/hotel';
import { createDailyRounds } from './hotel/dailyRounds';
import { jsonLog } from './observability';

const port = Number(process.env.PORT ?? 3000);
const clientDir = resolve(import.meta.dirname, '../../dist/client');

const enableTestRoutes = testRoutesEnabled(process.argv, process.env);

const timeZone = hotelTimeZone(process.env);
const storage = hotelStorage(process.env, resolve(import.meta.dirname, '../..'));
const hotel = createHotel({
  clock: createClock(undefined, timeZone),
  ...(storage.kind === 'sqlite' ? { persistence: createSqlitePersistence(storage.file), photosDir: storage.photosDir } : {}),
});
createDailyRounds(hotel).start(); // each morning at 6:00 hotel time

createApp({ repository: createRecordRepository(SEED_RECORDS), users: DEFAULT_USERS, clientDir, enableTestRoutes, hotel, log: jsonLog }).listen(port, () => {
  console.log(`server-in-test listening on http://localhost:${port}`);
  console.log(storage.kind === 'sqlite' ? `pet hotel data: ${storage.file}` : 'pet hotel data: in memory (HOTEL_STORAGE=memory)');
  console.log(`pet hotel time zone: ${timeZone} (today is ${hotel.clock.today()}); set HOTEL_TZ to change it`);
  if (enableTestRoutes) console.log('test-support routes enabled: POST /api/test/reset, PUT /api/test/clock');
  console.log(`change the UI version with: PUT http://localhost:${port}/api/ui-version {"version": 2}`);
});
