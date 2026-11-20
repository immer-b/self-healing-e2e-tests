import express, { type Request, type Response } from 'express';
import { join } from 'node:path';
import { authenticate, type UserAccount } from './auth';
import { buildReport } from './report';
import { validateRecordInput } from './validation';
import type { RecordRepository } from './recordRepository';
import type { RecordStatus } from './types';

export interface AppOptions {
  repository: RecordRepository;
  users: readonly UserAccount[];
  clientDir: string;
}

export const SPA_NAMES = ['login', 'query', 'report'] as const;

export function createApp({ repository, users, clientDir }: AppOptions) {
  const app = express();
  app.use(express.json());

  app.post('/api/login', (req: Request, res: Response) => {
    const { username = '', password = '' } = req.body ?? {};
    const result = authenticate(users, username, password);
    if (result.ok) res.json({ token: result.token, displayName: result.displayName });
    else res.status(401).json({ error: result.error });
  });

  app.get('/api/records', (req, res) => {
    const text = typeof req.query.text === 'string' ? req.query.text : undefined;
    const status = typeof req.query.status === 'string' ? (req.query.status as RecordStatus) : undefined;
    res.json(repository.list({ text, status }));
  });

  app.get('/api/records/:id', (req, res) => {
    const record = repository.get(req.params.id);
    if (record) res.json(record);
    else res.status(404).json({ error: 'Record not found' });
  });

  app.post('/api/records', (req, res) => {
    const result = validateRecordInput(req.body);
    if (!result.ok) res.status(400).json({ errors: result.errors });
    else res.status(201).json(repository.create(result.value));
  });

  app.put('/api/records/:id', (req, res) => {
    const result = validateRecordInput(req.body, { partial: true });
    if (!result.ok) {
      res.status(400).json({ errors: result.errors });
      return;
    }
    const updated = repository.update(req.params.id, result.value);
    if (updated) res.json(updated);
    else res.status(404).json({ error: 'Record not found' });
  });

  app.delete('/api/records/:id', (req, res) => {
    if (repository.remove(req.params.id)) res.status(204).end();
    else res.status(404).json({ error: 'Record not found' });
  });

  app.get('/api/report', (_req, res) => {
    res.json(buildReport(repository.list()));
  });

  app.post('/api/test/reset', (_req, res) => {
    repository.reset();
    res.status(204).end();
  });

  for (const name of SPA_NAMES) {
    const appDir = join(clientDir, name);
    app.use(`/${name}`, express.static(appDir));
    app.use(`/${name}`, (_req, res) => res.sendFile(join(appDir, 'index.html')));
  }
  // Vite emits shared chunks under /assets.
  app.use('/assets', express.static(join(clientDir, 'assets')));
  app.get('/', (_req, res) => res.redirect('/login/'));

  return app;
}
