import type { NextFunction, Request, Response } from 'express';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Conservative security headers for every response. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  });
  next();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Blocks state-changing requests whose Origin is not this server. Defence in depth on top of
 * SameSite=Strict cookies. Requests without an Origin header (curl, server-to-server) pass.
 */
export function sameOriginWrites(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (SAFE_METHODS.has(req.method) || !origin) return next();
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    host = '';
  }
  if (host && host === req.headers.host) return next();
  res.status(403).json({ error: 'Cross-origin request blocked' });
}
