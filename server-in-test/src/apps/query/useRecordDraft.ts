import { useState, type ChangeEvent } from 'react';
import type { DataRecord, RecordInput } from '../shared/api';
import type { RecordStatus } from '../../server/types';

interface Draft {
  name: string;
  owner: string;
  status: RecordStatus;
  amount: string;
}

/** Form state for creating or editing a record, plus a save helper that surfaces server errors. */
export function useRecordDraft(initial: DataRecord | undefined, onSave: (input: RecordInput) => Promise<void>) {
  const [draft, setDraft] = useState<Draft>({
    name: initial?.name ?? '',
    owner: initial?.owner ?? '',
    status: initial?.status ?? 'active',
    amount: initial ? String(initial.amount) : '',
  });
  const [error, setError] = useState<string>();

  const bind = (field: keyof Draft) => ({
    value: draft[field],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((d) => ({ ...d, [field]: e.target.value })),
  });

  const submit = async (event?: { preventDefault(): void }) => {
    event?.preventDefault();
    try {
      await onSave({ ...draft, amount: Number(draft.amount) });
    } catch (e) {
      setError((e as Error).message || 'Could not save record');
    }
  };

  return { bind, submit, error };
}
