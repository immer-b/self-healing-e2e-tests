import { Router } from 'express';
import type { RecordRepository } from '../recordRepository';
import { buildReport } from '../report';

export function reportRoutes(repository: RecordRepository) {
  return Router().get('/', (_req, res) => {
    res.json(buildReport(repository.list()));
  });
}
