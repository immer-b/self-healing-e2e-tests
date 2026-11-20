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
import { sameOriginWrites, securityHeaders } from './security';
import { healthRoutes, requestLogger, silentLog, type Log } from './observability';

export interface AppOptions {
  repository: RecordRepository;
  users: readonly UserAccount[];
  /** Folder containing the Vite build: <clientDir>/{login,query,report,hotel}/index.html and /assets. */
  clientDir: string;
  /** The pet hotel domain. Defaults to a seeded hotel on the real clock. */
  hotel?: Hotel;
  /** Mount /api/test/* (reset, clock). Off unless asked for: never enable in production. */
  enableTestRoutes?: boolean;
  /** Where request logs go. Silent by default; the server entry point logs JSON to stdout. */
  log?: Log;
}

export function createApp({ repository, users, clientDir, hotel = createHotel({ clock: createClock() }), enableTestRoutes = false, log = silentLog }: AppOptions) {
  const app = express()
    .disable('x-powered-by')
    .use(requestLogger(log))
    .use(securityHeaders)
    .use(healthRoutes(() => hotel.rooms.list()))
    .use(express.json())
    .use('/api', authRoutes(users))
    .use('/api/records', recordRoutes(repository))
    .use('/api/report', reportRoutes(repository))
    .use('/api/ui-version', uiVersionRoutes(createUiVersionState()))
    .use('/api/hotel', sameOriginWrites, hotelRoutes(hotel));
  if (enableTestRoutes) app.use('/api/test', testSupportRoutes(repository, hotel));
  return app.use(spaRoutes(clientDir));
}
