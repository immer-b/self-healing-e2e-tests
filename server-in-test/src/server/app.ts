import express from 'express';
import type { UserAccount } from './auth';
import type { RecordRepository } from './recordRepository';
import { authRoutes } from './routes/authRoutes';
import { recordRoutes } from './routes/recordRoutes';
import { reportRoutes } from './routes/reportRoutes';
import { testSupportRoutes } from './routes/testSupportRoutes';
import { spaRoutes } from './routes/spaRoutes';
import { createUiVersionState, uiVersionRoutes } from './routes/uiVersionRoutes';
import { createClock } from './hotel/clock';
import { createHotel, type Hotel } from './hotel/hotel';
import { hotelRoutes } from './hotel/routes';

export interface AppOptions {
  repository: RecordRepository;
  users: readonly UserAccount[];
  /** Folder containing the Vite build: <clientDir>/{login,query,report,hotel}/index.html and /assets. */
  clientDir: string;
  /** The pet hotel domain. Defaults to a seeded hotel on the real clock. */
  hotel?: Hotel;
}

export function createApp({ repository, users, clientDir, hotel = createHotel({ clock: createClock() }) }: AppOptions) {
  return express()
    .use(express.json())
    .use('/api', authRoutes(users))
    .use('/api/records', recordRoutes(repository))
    .use('/api/report', reportRoutes(repository))
    .use('/api/ui-version', uiVersionRoutes(createUiVersionState()))
    .use('/api/hotel', hotelRoutes(hotel))
    .use('/api/test', testSupportRoutes(repository, hotel))
    .use(spaRoutes(clientDir));
}
