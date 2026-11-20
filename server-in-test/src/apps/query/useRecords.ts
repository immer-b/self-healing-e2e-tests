import { useCallback, useEffect, useState } from 'react';
import { api, type DataRecord, type RecordFilter, type RecordInput } from '../shared/api';

/** Loads records for the current filter and exposes CRUD operations that refresh the list. */
export function useRecords() {
  const [filter, setFilter] = useState<RecordFilter>({ text: '', status: '' });
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    api.listRecords(filter).then((result) => {
      if (stale) return;
      setRecords(result);
      setLoading(false);
    });
    return () => {
      stale = true;
    };
  }, [filter, reloadToken]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const save = useCallback(
    async (input: RecordInput, id?: string) => {
      await (id ? api.updateRecord(id, input) : api.createRecord(input));
      reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.deleteRecord(id);
      reload();
    },
    [reload],
  );

  const updateFilter = useCallback((patch: RecordFilter) => setFilter((f) => ({ ...f, ...patch })), []);

  return { records, filter, loading, updateFilter, save, remove };
}

export type RecordsModel = ReturnType<typeof useRecords>;
