import express, { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { UiVersion } from '../types';

export const SPA_NAMES = ['login', 'query', 'report'] as const;

/** Adds a ui-version meta tag so the SPA knows the server's default layout without a ?v= parameter. */
const withUiVersion = (html: string, uiVersion: UiVersion) =>
  html.replace('</head>', `<meta name="ui-version" content="${uiVersion}"></head>`);

/**
 * Serves each built single page app under /<name>/. Every page request (including deep links) gets
 * the app's index.html with the default UI version injected; other files are served statically.
 */
export function spaRoutes(clientDir: string, uiVersion: UiVersion) {
  const router = Router();
  for (const name of SPA_NAMES) {
    const appDir = join(clientDir, name);
    router.use(`/${name}`, express.static(appDir, { index: false }));
    router.use(`/${name}`, async (_req, res, next) => {
      try {
        res.type('html').send(withUiVersion(await readFile(join(appDir, 'index.html'), 'utf8'), uiVersion));
      } catch (error) {
        next(error);
      }
    });
  }
  router.use('/assets', express.static(join(clientDir, 'assets')));
  router.get('/', (_req, res) => res.redirect('/login/'));
  return router;
}
