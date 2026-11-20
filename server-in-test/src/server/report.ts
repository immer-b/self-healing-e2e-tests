import { RECORD_STATUSES, type DataRecord, type RecordStatus } from './types';

export interface OwnerSummary {
  owner: string;
  count: number;
  amount: number;
}

export interface Report {
  totalRecords: number;
  totalAmount: number;
  averageAmount: number;
  byStatus: Record<RecordStatus, number>;
  byOwner: OwnerSummary[];
}

export function buildReport(records: readonly DataRecord[]): Report {
  const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);

  const byStatus = Object.fromEntries(RECORD_STATUSES.map((s) => [s, 0])) as Record<RecordStatus, number>;
  records.forEach((r) => byStatus[r.status]++);

  const owners = new Map<string, OwnerSummary>();
  records.forEach(({ owner, amount }) => {
    const summary = owners.get(owner) ?? { owner, count: 0, amount: 0 };
    owners.set(owner, { owner, count: summary.count + 1, amount: summary.amount + amount });
  });

  return {
    totalRecords: records.length,
    totalAmount,
    averageAmount: records.length ? Math.round(totalAmount / records.length) : 0,
    byStatus,
    byOwner: [...owners.values()].sort((a, b) => b.amount - a.amount),
  };
}
