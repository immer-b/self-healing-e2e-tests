import express, { Router } from 'express';
import { join } from 'node:path';

const SPA_NAMES = ['login', 'query', 'report'] as const;

/**
 * Serves each built single page app under /<name>/ with a fallback to its index.html for deep links,
 * plus the shared Vite asset folder.
 */
export function spaRoutes(clientDir: string) {
  const router = Router();
  for (const name of SPA_NAMES) {
    const appDir = join(clientDir, name);
    router.use(`/${name}`, express.static(appDir));
    router.use(`/${name}`, (_req, res) => res.sendFile(join(appDir, 'index.html')));
  }
  router.use('/assets', express.static(join(clientDir, 'assets')));
  router.get('/', (_req, res) => res.redirect('/login/'));
  return router;
}
