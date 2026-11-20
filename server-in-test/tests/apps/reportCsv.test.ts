import { describe, it, expect } from 'vitest';
import { reportToCsv } from '../../src/apps/report/reportCsv';
import { buildReport } from '../../src/server/report';

describe('reportToCsv', () => {
  it('writes summary metrics then the owner breakdown', () => {
    const report = buildReport([
      { id: '1', name: 'A', owner: 'alice', status: 'active', amount: 100 },
      { id: '2', name: 'B', owner: 'bob', status: 'pending', amount: 300 },
    ]);
    expect(reportToCsv(report).split('\n')).toEqual([
      'metric,value',
      'totalRecords,2',
      'totalAmount,400',
      'averageAmount,200',
      'status.active,1',
      'status.inactive,0',
      'status.pending,1',
      '',
      'owner,count,amount',
      'bob,1,300',
      'alice,1,100',
    ]);
  });

  it('quotes values containing commas or quotes', () => {
    const report = buildReport([{ id: '1', name: 'A', owner: 'Smith, "J"', status: 'active', amount: 1 }]);
    expect(reportToCsv(report)).toContain('"Smith, ""J""",1,1');
  });
});
