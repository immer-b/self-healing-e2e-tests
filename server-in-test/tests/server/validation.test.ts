import { describe, it, expect } from 'vitest';
import { validateRecordInput } from '../../src/server/validation';

describe('validateRecordInput', () => {
  const valid = { name: 'N', owner: 'o', status: 'active', amount: 1 };

  it('accepts a complete valid record and coerces numeric strings', () => {
    expect(validateRecordInput(valid)).toEqual({ ok: true, value: valid });
    expect(validateRecordInput({ ...valid, amount: '12' })).toEqual({ ok: true, value: { ...valid, amount: 12 } });
  });

  it('reports every invalid field', () => {
    const result = validateRecordInput({ name: ' ', status: 'x', amount: -3 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['amount', 'name', 'owner', 'status']);
  });

  it('in partial mode only validates provided fields', () => {
    expect(validateRecordInput({ name: 'Only' }, { partial: true })).toEqual({ ok: true, value: { name: 'Only' } });
  });
});
