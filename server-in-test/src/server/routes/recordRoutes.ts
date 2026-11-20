import { Router, type Response } from 'express';
import type { RecordRepository } from '../recordRepository';
import type { RecordStatus } from '../types';
import { validateRecordInput } from '../validation';

const notFound = (res: Response) => res.status(404).json({ error: 'Record not found' });
const queryString = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** CRUD + filtering for records, mounted at /api/records. */
export function recordRoutes(repository: RecordRepository) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(repository.list({ text: queryString(req.query.text), status: queryString(req.query.status) as RecordStatus }));
  });

  router.get('/:id', (req, res) => {
    const record = repository.get(req.params.id);
    if (record) res.json(record);
    else notFound(res);
  });

  router.post('/', (req, res) => {
    const result = validateRecordInput(req.body);
    if (!result.ok) res.status(400).json({ errors: result.errors });
    else res.status(201).json(repository.create(result.value));
  });

  router.put('/:id', (req, res) => {
    const result = validateRecordInput(req.body, { partial: true });
    if (!result.ok) {
      res.status(400).json({ errors: result.errors });
      return;
    }
    const updated = repository.update(req.params.id, result.value);
    if (updated) res.json(updated);
    else notFound(res);
  });

  router.delete('/:id', (req, res) => {
    if (repository.remove(req.params.id)) res.status(204).end();
    else notFound(res);
  });

  return router;
}
