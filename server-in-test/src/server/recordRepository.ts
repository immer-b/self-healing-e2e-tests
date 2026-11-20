import type { DataRecord, RecordFilter, RecordInput } from './types';

/** In-memory record store. Pure closures, no classes. */
export function createRecordRepository(seed: readonly RecordInput[]) {
  let records: DataRecord[] = [];
  let nextId = 1;

  const insert = (input: RecordInput): DataRecord => {
    const record = { ...input, id: String(nextId++) };
    records.push(record);
    return record;
  };

  const reset = () => {
    records = [];
    nextId = 1;
    seed.forEach(insert);
  };

  const matches = (record: DataRecord, { text, status }: RecordFilter) => {
    const needle = text?.trim().toLowerCase();
    const textOk = !needle || `${record.name} ${record.owner}`.toLowerCase().includes(needle);
    const statusOk = !status || record.status === status;
    return textOk && statusOk;
  };

  reset();

  return {
    list: (filter: RecordFilter = {}) => records.filter((r) => matches(r, filter)).map((r) => ({ ...r })),
    get: (id: string) => {
      const found = records.find((r) => r.id === id);
      return found && { ...found };
    },
    create: (input: RecordInput) => ({ ...insert(input) }),
    update: (id: string, patch: Partial<RecordInput>) => {
      const index = records.findIndex((r) => r.id === id);
      if (index < 0) return undefined;
      records[index] = { ...records[index], ...patch, id };
      return { ...records[index] };
    },
    remove: (id: string) => {
      const before = records.length;
      records = records.filter((r) => r.id !== id);
      return records.length < before;
    },
    reset,
  };
}

export type RecordRepository = ReturnType<typeof createRecordRepository>;
