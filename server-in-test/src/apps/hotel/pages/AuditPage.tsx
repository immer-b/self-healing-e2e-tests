import { useState } from 'react';
import { api, type FieldChange } from '../api';
import { Icon } from '../components/Icon';
import { Badge, Card, EmptyState, ErrorBanner, Loading, PageHeader, SelectField, TextField, type Tone } from '../components/ui';
import { formatDateTime, humanize, useResource } from '../lib';
import { navigate, useSearchParams } from '../router';

const ENTITY_TYPES = [
  { value: '', label: 'All entities' },
  { value: 'employee', label: 'Employees' },
  { value: 'owner', label: 'Owners' },
  { value: 'pet', label: 'Pets' },
  { value: 'room', label: 'Rooms' },
  { value: 'stay', label: 'Stays' },
  { value: 'note', label: 'Notes' },
  { value: 'task', label: 'Care rounds' },
];
const TYPE_NAMES: Record<string, string> = { employee: 'Employee', owner: 'Owner', pet: 'Pet', room: 'Room', stay: 'Stay', note: 'Note', task: 'Care round' };

const ACTIONS: Record<string, { label: string; tone: Tone }> = {
  create: { label: 'Created', tone: 'success' },
  update: { label: 'Updated', tone: 'info' },
  delete: { label: 'Archived', tone: 'danger' },
  restore: { label: 'Restored', tone: 'accent' },
  check_in: { label: 'Checked in', tone: 'success' },
  check_out: { label: 'Checked out', tone: 'neutral' },
  cancel: { label: 'Cancelled', tone: 'danger' },
  reassign: { label: 'Reassigned', tone: 'info' },
  unassign: { label: 'Unassigned', tone: 'warning' },
  photo: { label: 'Photo added', tone: 'info' },
  complete: { label: 'Completed', tone: 'success' },
};

const show = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

function Changes({ changes }: { changes: FieldChange[] }) {
  if (!changes.length) return <span className="muted">—</span>;
  return (
    <ul className="changes">
      {changes.map((c) => (
        <li key={c.field}>
          <code>{humanize(c.field)}</code>{' '}
          {c.from !== null && (
            <>
              <span className="change-from">{show(c.from)}</span> →{' '}
            </>
          )}
          <span className="change-to">{show(c.to)}</span>
        </li>
      ))}
    </ul>
  );
}

export function AuditPage(_props: { params: Record<string, string> }) {
  const search = useSearchParams();
  const entityType = search.get('entityType') ?? '';
  const entityId = search.get('entityId') ?? '';
  const [idDraft, setIdDraft] = useState(entityId);
  const { data: entries, error, loading, reload } = useResource(() => api.audit({ entityType, entityId }), [entityType, entityId]);

  const setFilter = (next: { entityType?: string; entityId?: string }) => {
    const params = new URLSearchParams();
    const type = next.entityType ?? entityType;
    const id = next.entityId ?? entityId;
    if (type) params.set('entityType', type);
    if (id) params.set('entityId', id);
    const qs = params.toString();
    navigate(`/audit${qs ? `?${qs}` : ''}`, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Change log"
        subtitle="Every change to staff, guests, rooms, stays and care rounds: who made it and when. Entries can't be edited or removed."
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => reload()}>
            <Icon name="restore" /> Refresh
          </button>
        }
      />
      <Card>
        <div className="toolbar">
          <SelectField label="Entity type" value={entityType} options={ENTITY_TYPES} onChange={(e) => setFilter({ entityType: e.target.value, entityId: '' })} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setFilter({ entityId: idDraft.trim() });
            }}
          >
            <TextField label="Record ID" placeholder="e.g. pet-3" value={idDraft} onChange={(e) => setIdDraft(e.target.value)} onBlur={() => setFilter({ entityId: idDraft.trim() })} />
          </form>
          <span className="spacer" />
          {entries && <span className="count">{entries.length} entries</span>}
        </div>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {loading && !entries ? (
          <Loading />
        ) : entries?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const action = ACTIONS[entry.action] ?? { label: entry.action, tone: 'neutral' as Tone };
                  return (
                    <tr key={entry.id}>
                      <td className="nowrap">{formatDateTime(entry.at)}</td>
                      <td className="nowrap">{entry.actor.name}</td>
                      <td>
                        <Badge tone={action.tone}>{action.label}</Badge>
                      </td>
                      <td>
                        <div className="cell-title">{entry.label}</div>
                        <button type="button" className="link-button entity-link" onClick={() => { setIdDraft(entry.entityId); setFilter({ entityType: entry.entityType, entityId: entry.entityId }); }}>
                          {TYPE_NAMES[entry.entityType] ?? entry.entityType} · {entry.entityId}
                        </button>
                      </td>
                      <td>
                        <Changes changes={entry.changes} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="audit" title="No changes recorded for this filter" />
        )}
      </Card>
    </>
  );
}
