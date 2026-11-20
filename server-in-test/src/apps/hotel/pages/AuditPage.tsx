import { useEffect, useState } from 'react';
import { api, type FieldChange, type LabeledAuditEntry } from '../api';
import { Icon } from '../components/Icon';
import { Badge, Card, EmptyState, ErrorBanner, Loading, PageHeader, SelectField, TextField, type Tone } from '../components/ui';
import { formatDateTime, humanize, useResource } from '../lib';
import { navigate, useSearchParams } from '../router';
import { useEmployee } from '../auth';
import { downloadCsv, toCsv } from '../csv';

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
  change: { label: 'Changed', tone: 'info' },
  room_change: { label: 'Room changed', tone: 'info' },
  password_change: { label: 'Password changed', tone: 'accent' },
};

const show = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

function Changes({ changes, collapsed }: { changes: FieldChange[]; collapsed: boolean }) {
  if (!changes.length) return <span className="muted">—</span>;
  if (collapsed) {
    return (
      <details className="changes-details">
        <summary>{changes.length} fields set</summary>
        <ChangeList changes={changes} />
      </details>
    );
  }
  return <ChangeList changes={changes} />;
}

function ChangeList({ changes }: { changes: FieldChange[] }) {
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
  const from = search.get('from') ?? '';
  const to = search.get('to') ?? '';
  const firstPage = useResource(() => api.audit({ entityType, entityId, from, to }), [entityType, entityId, from, to]);
  const { error, loading } = firstPage;
  const [entries, setEntries] = useState<LabeledAuditEntry[]>();
  const [nextCursor, setNextCursor] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!firstPage.data) return;
    setEntries(firstPage.data.entries);
    setNextCursor(firstPage.data.nextCursor);
  }, [firstPage.data]);

  const { today } = useEmployee();
  const [exporting, setExporting] = useState(false);
  const reload = () => firstPage.reload();

  /** Exports every entry matching the filters, fetching the remaining pages first. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: LabeledAuditEntry[] = [];
      let before: string | undefined;
      do {
        const page = await api.audit({ entityType, entityId, from, to, before });
        all.push(...page.entries);
        before = page.nextCursor;
      } while (before);
      const rows = all.map((e) => [
        e.at,
        e.actor.name,
        ACTIONS[e.action]?.label ?? e.action,
        TYPE_NAMES[e.entityType] ?? e.entityType,
        e.entityId,
        e.label,
        e.changes.map((c) => `${humanize(c.field)}: ${show(c.from)} → ${show(c.to)}`).join('; '),
      ]);
      downloadCsv(`change-log-${today}.csv`, toCsv(['When', 'Who', 'Action', 'Record type', 'Record ID', 'Record', 'Changes'], rows));
    } finally {
      setExporting(false);
    }
  };
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await api.audit({ entityType, entityId, from, to, before: nextCursor });
      setEntries((current) => [...(current ?? []), ...page.entries]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const setFilter = (next: { entityType?: string; entityId?: string; from?: string; to?: string }) => {
    const params = new URLSearchParams();
    const values = { entityType, entityId, from, to, ...next };
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    const qs = params.toString();
    navigate(`/audit${qs ? `?${qs}` : ''}`, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Change log"
        subtitle="Every change to staff, guests, rooms, stays and care rounds: who made it and when. Entries can't be edited or removed."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={exporting || !entries?.length}>
              <Icon name="note" /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => reload()}>
              <Icon name="restore" /> Refresh
            </button>
          </>
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
          <TextField label="From" type="date" value={from} max={to || undefined} onChange={(e) => setFilter({ from: e.target.value })} />
          <TextField label="To" type="date" value={to} min={from || undefined} onChange={(e) => setFilter({ to: e.target.value })} />
          <span className="spacer" />
          {entries && <span className="count">{entries.length}{nextCursor ? '+' : ''} entries</span>}
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
                        <Changes changes={entry.changes} collapsed={entry.action === 'create' && entry.changes.length > 2} />
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
        {nextCursor && entries?.length ? (
          <div className="card-body" style={{ display: 'flex', justifyContent: 'center' }}>
            <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        ) : null}
      </Card>
    </>
  );
}
