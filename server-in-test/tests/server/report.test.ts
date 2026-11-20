import { describe, it, expect } from 'vitest';
import { buildReport } from '../../src/server/report';
import type { DataRecord } from '../../src/server/types';

const records: DataRecord[] = [
  { id: '1', name: 'A', owner: 'alice', status: 'active', amount: 100 },
  { id: '2', name: 'B', owner: 'bob', status: 'inactive', amount: 250 },
  { id: '3', name: 'C', owner: 'alice', status: 'pending', amount: 50 },
  { id: '4', name: 'D', owner: 'carol', status: 'active', amount: 0 },
];

describe('buildReport', () => {
  it('summarises totals and averages', () => {
    const report = buildReport(records);
    expect(report.totalRecords).toBe(4);
    expect(report.totalAmount).toBe(400);
    expect(report.averageAmount).toBe(100);
  });

  it('counts records per status, including zero counts', () => {
    expect(buildReport(records).byStatus).toEqual({ active: 2, inactive: 1, pending: 1 });
    expect(buildReport([]).byStatus).toEqual({ active: 0, inactive: 0, pending: 0 });
  });

  it('groups by owner sorted by amount descending', () => {
    expect(buildReport(records).byOwner).toEqual([
      { owner: 'bob', count: 1, amount: 250 },
      { owner: 'alice', count: 2, amount: 150 },
      { owner: 'carol', count: 1, amount: 0 },
    ]);
  });

  it('handles an empty dataset without dividing by zero', () => {
    expect(buildReport([]).averageAmount).toBe(0);
  });
});

describe('buildReport rounding', () => {
  it('rounds the average to the nearest whole amount', () => {
    const report = buildReport([
      { id: '1', name: 'A', owner: 'a', status: 'active', amount: 1200 },
      { id: '2', name: 'B', owner: 'b', status: 'active', amount: 800 },
      { id: '3', name: 'C', owner: 'c', status: 'active', amount: 450 },
    ]);
    expect(report.averageAmount).toBe(817); // 816.67
  });
});
