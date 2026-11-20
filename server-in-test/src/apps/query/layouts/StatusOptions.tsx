import { RECORD_STATUSES } from '../../../server/types';

export function StatusOptions({ includeAll = false }: { includeAll?: boolean }) {
  return (
    <>
      {includeAll && <option value="">All statuses</option>}
      {RECORD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </>
  );
}
