import type { RecordInput } from './types';

export const SEED_RECORDS: readonly RecordInput[] = [
  { name: 'Alpha Project', owner: 'alice', status: 'active', amount: 1200 },
  { name: 'Beta Launch', owner: 'bob', status: 'inactive', amount: 800 },
  { name: 'Gamma Audit', owner: 'alice', status: 'pending', amount: 450 },
  { name: 'Delta Migration', owner: 'carol', status: 'active', amount: 3000 },
  { name: 'Epsilon Research', owner: 'dave', status: 'pending', amount: 150 },
  { name: 'Zeta Rollout', owner: 'bob', status: 'active', amount: 2200 },
];
