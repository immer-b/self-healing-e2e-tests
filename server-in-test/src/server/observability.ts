import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';

export type LogEntry = Record<string, unknown>;
export type Log = (entry: LogEntry) => void;

/** Writes one JSON object per line to stdout, the format log collectors expect. */
export const jsonLog: Log = (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`);
export const silentLog: Log = () => {};

const TRACEABLE_ID = /^[\w.-]{1,64}$/;

/**
 * Tags every request with an id (kept from `X-Request-Id` when well-formed) and logs one line
 * when the response finishes. Only method, path (no query string), status, timing and the
 * signed-in employee id are logged: never bodies, queries or cookies.
 */
export function requestLogger(log: Log) {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && TRACEABLE_ID.test(incoming) ? incoming : randomUUID();
    const started = process.hrtime.bigint();
    res.locals.requestId = requestId;
    res.set('X-Request-Id', requestId);
    res.on('finish', () => {
      const status = res.statusCode;
      log({
        time: new Date().toISOString(),
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        msg: 'request',
        requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status,
        durationMs: Number((process.hrtime.bigint() - started) / 1000n) / 1000,
        ...(res.locals.employeeId ? { employeeId: res.locals.employeeId } : {}),
      });
    });
    next();
  };
}

/** Liveness and readiness: the process is up and the data store answers. */
export function healthRoutes(checkDataStore: () => void) {
  const startedAt = Date.now();
  return Router().get('/healthz', (_req, res) => {
    let dataStore = 'ok';
    try {
      checkDataStore();
    } catch {
      dataStore = 'failing';
    }
    res.status(dataStore === 'ok' ? 200 : 503).json({
      status: dataStore === 'ok' ? 'ok' : 'degraded',
      checks: { dataStore },
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });
}
