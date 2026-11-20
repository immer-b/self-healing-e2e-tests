import type { Errors } from './validation';

/** Result of a domain operation. Failures carry the HTTP status the API should answer with. */
export type Outcome<T> =
  | { ok: true; value: T; status?: undefined; error?: undefined; errors?: undefined }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string; errors?: Errors; value?: undefined };

export const success = <T>(value: T): Outcome<T> => ({ ok: true, value });

export const invalid = (errors: Errors, status: 400 | 409 = 400): Outcome<never> => ({
  ok: false,
  status,
  error: status === 409 ? 'Conflict' : 'Validation failed',
  errors,
});

export const notFound = (what: string): Outcome<never> => ({ ok: false, status: 404, error: `${what} not found` });

export const conflict = (error: string): Outcome<never> => ({ ok: false, status: 409, error });

export const fromValidation = <T>(result: { ok: true; value: T } | { ok: false; errors: Errors }) =>
  result.ok ? null : invalid(result.errors);
