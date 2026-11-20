import express from 'express';
import type { UserAccount } from './auth';
import type { RecordRepository } from './recordRepository';
import { authRoutes } from './routes/authRoutes';
import { recordRoutes } from './routes/recordRoutes';
import { reportRoutes, testSupportRoutes } from './routes/reportRoutes';
import { spaRoutes } from './routes/spaRoutes';
import { createUiVersionState, uiVersionRoutes } from './routes/uiVersionRoutes';

export interface AppOptions {
  repository: RecordRepository;
  users: readonly UserAccount[];
  /** Folder containing the Vite build: <clientDir>/{login,query,report}/index.html and /assets. */
  clientDir: string;
}

export function createApp({ repository, users, clientDir }: AppOptions) {
  return express()
    .use(express.json())
    .use('/api', authRoutes(users))
    .use('/api/records', recordRoutes(repository))
    .use('/api/report', reportRoutes(repository))
    .use('/api/ui-version', uiVersionRoutes(createUiVersionState()))
    .use('/api/test', testSupportRoutes(repository))
    .use(spaRoutes(clientDir));
}
