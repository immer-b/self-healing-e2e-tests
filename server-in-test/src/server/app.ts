import express from 'express';
import type { UserAccount } from './auth';
import type { RecordRepository } from './recordRepository';
import type { UiVersion } from './types';
import { authRoutes } from './routes/authRoutes';
import { recordRoutes } from './routes/recordRoutes';
import { reportRoutes, testSupportRoutes } from './routes/reportRoutes';
import { spaRoutes } from './routes/spaRoutes';

export interface AppOptions {
  repository: RecordRepository;
  users: readonly UserAccount[];
  /** Folder containing the Vite build: <clientDir>/{login,query,report}/index.html and /assets. */
  clientDir: string;
  /** Layout served when a page has no ?v= parameter. Default 1. */
  uiVersion?: UiVersion;
}

export function createApp({ repository, users, clientDir, uiVersion = 1 }: AppOptions) {
  return express()
    .use(express.json())
    .use('/api', authRoutes(users))
    .use('/api/records', recordRoutes(repository))
    .use('/api/report', reportRoutes(repository))
    .use('/api/test', testSupportRoutes(repository))
    .use(spaRoutes(clientDir, uiVersion));
}
