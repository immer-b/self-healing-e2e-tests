/** UI layouts the sample apps can render; chosen per server (--ui-version) or per page (?v=). */
export const UI_VERSIONS = [1, 2, 3] as const;
export type UiVersion = (typeof UI_VERSIONS)[number];

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
