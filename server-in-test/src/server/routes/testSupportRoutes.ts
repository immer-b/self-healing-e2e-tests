import { Router } from 'express';
import type { RecordRepository } from '../recordRepository';

/** Test-only helpers so end-to-end tests can start from a known dataset. */
export function testSupportRoutes(repository: RecordRepository) {
  return Router().post('/reset', (_req, res) => {
    repository.reset();
    res.status(204).end();
  });
}
