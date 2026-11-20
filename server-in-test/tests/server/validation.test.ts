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

describe('validateRecordInput edge cases', () => {
  const valid = { name: 'N', owner: 'o', status: 'active', amount: 1 };

  it('trims text fields', () => {
    expect(validateRecordInput({ ...valid, name: '  Padded  ' })).toMatchObject({ ok: true, value: { name: 'Padded' } });
  });

  it.each([['', 'blank string'], ['abc', 'non-numeric string'], [Infinity, 'infinity'], [NaN, 'NaN'], [null, 'null']])(
    'rejects amount %j (%s)',
    (amount: unknown, _label: string) => {
      expect(validateRecordInput({ ...valid, amount })).toMatchObject({ ok: false, errors: { amount: expect.any(String) } });
    },
  );

  it('accepts zero', () => {
    expect(validateRecordInput({ ...valid, amount: 0 }).ok).toBe(true);
  });

  it('rejects a non-object body', () => {
    expect(validateRecordInput(undefined).ok).toBe(false);
    expect(validateRecordInput('nope').ok).toBe(false);
  });
});
