import { RECORD_STATUSES, type RecordInput, type RecordStatus } from './types';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

type FieldValidator = (raw: unknown) => { value?: unknown; error?: string };

const requiredText: FieldValidator = (raw) =>
  typeof raw === 'string' && raw.trim() ? { value: raw.trim() } : { error: 'is required' };

const FIELD_VALIDATORS: Record<keyof RecordInput, FieldValidator> = {
  name: requiredText,
  owner: requiredText,
  status: (raw) =>
    RECORD_STATUSES.includes(raw as RecordStatus)
      ? { value: raw }
      : { error: `must be one of ${RECORD_STATUSES.join(', ')}` },
  amount: (raw) => {
    const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? { value }
      : { error: 'must be a non-negative number' };
  },
};

export function validateRecordInput(body: unknown, options: { partial: true }): ValidationResult<Partial<RecordInput>>;
export function validateRecordInput(body: unknown, options?: { partial?: false }): ValidationResult<RecordInput>;
export function validateRecordInput(
  body: unknown,
  { partial = false }: { partial?: boolean } = {},
): ValidationResult<Partial<RecordInput>> {
  const input = (body ?? {}) as Record<string, unknown>;
  const value: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const [field, validate] of Object.entries(FIELD_VALIDATORS)) {
    if (partial && input[field] === undefined) continue;
    const result = validate(input[field]);
    if (result.error) errors[field] = result.error;
    else value[field] = result.value;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: value as Partial<RecordInput> };
}
