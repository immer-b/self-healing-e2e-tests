import { Router } from 'express';
import type { RecordRepository } from '../recordRepository';
import type { Hotel } from '../hotel/hotel';

/** Test-only helpers so end-to-end tests can start from a known dataset and date. */
export function testSupportRoutes(repository: RecordRepository, hotel: Hotel) {
  return Router()
    .post('/reset', (_req, res) => {
      repository.reset();
      hotel.reset();
      res.status(204).end();
    })
    .put('/clock', (req, res) => {
      const { now } = req.body ?? {};
      if (now === null || now === undefined) {
        hotel.clock.set(undefined);
      } else {
        const date = new Date(String(now));
        if (Number.isNaN(date.getTime())) {
          res.status(400).json({ error: 'now must be an ISO date-time or null' });
          return;
        }
        hotel.clock.set(date);
      }
      res.json({ now: hotel.clock.now().toISOString(), today: hotel.clock.today() });
    });
}
