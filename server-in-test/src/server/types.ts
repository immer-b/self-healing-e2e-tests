export const RECORD_STATUSES = ['active', 'inactive', 'pending'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export interface RecordInput {
  name: string;
  owner: string;
  status: RecordStatus;
  amount: number;
}

export interface DataRecord extends RecordInput {
  id: string;
}

export interface RecordFilter {
  text?: string;
  status?: RecordStatus | '';
}
