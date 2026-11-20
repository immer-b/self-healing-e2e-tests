import { Router } from 'express';
import type { RecordRepository } from '../recordRepository';
import { buildReport } from '../report';

export function reportRoutes(repository: RecordRepository) {
  return Router().get('/', (_req, res) => {
    res.json(buildReport(repository.list()));
  });
}

/** Test-only helpers so end-to-end tests can start from a known dataset. */
export function testSupportRoutes(repository: RecordRepository) {
  return Router().post('/reset', (_req, res) => {
    repository.reset();
    res.status(204).end();
  });
}
