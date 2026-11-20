import { useState } from 'react';
import type { DataRecord, RecordInput } from '../../shared/api';
import { formatCurrency } from '../../shared/format';
import { useRecordDraft } from '../useRecordDraft';
import { StatusOptions } from './StatusOptions';
import type { QueryLayoutProps } from './types';

type Drawer =
  | { mode: 'details' | 'edit' | 'confirmDelete'; record: DataRecord }
  | { mode: 'create' };

/** v3: card list; the "⋮" button opens a side drawer holding the record details and RUD actions. */
export function CardDrawerLayout({ records, filter, updateFilter, save, remove }: QueryLayoutProps) {
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const close = () => setDrawer(null);

  return (
    <div className="cards-page" data-ui-version="3">
      <header className="cards-header">
        <h1>Record explorer</h1>
        <div className="search-bar">
          <input type="search" data-qa="search-box" aria-label="Search records" placeholder="Search…"
            value={filter.text} onChange={(e) => updateFilter({ text: e.target.value })} />
          <select data-qa="status-select" aria-label="Filter by status" value={filter.status}
            onChange={(e) => updateFilter({ status: e.target.value as DataRecord['status'] })}>
            <StatusOptions includeAll />
          </select>
        </div>
        <div className="summary" role="status">Showing {records.length} records</div>
      </header>

      {records.length === 0 ? (
        <p className="empty-state">No records to show</p>
      ) : (
        <ul className="card-list">
          {records.map((record) => (
            <li className="result-card" key={record.id} data-record={record.id}>
              <div className="card-head">
                <h3>{record.name}</h3>
                <button className="card-more" type="button" aria-label="More actions"
                  onClick={() => setDrawer({ mode: 'details', record })}>⋮</button>
              </div>
              <p className="owner">Owner: {record.owner}</p>
              <span className={`badge badge-${record.status}`}>{record.status}</span>
              <span className="amount">{formatCurrency(record.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      <button className="fab" type="button" aria-label="Create record" onClick={() => setDrawer({ mode: 'create' })}>+</button>

      {drawer && (
        <aside className="drawer" role="dialog" aria-label={drawer.mode === 'create' ? 'New record' : 'Record details'}>
          <button className="drawer-close" type="button" aria-label="Close drawer" onClick={close}>×</button>
          {drawer.mode === 'create' ? (
            <DrawerForm onCancel={close} onSave={async (input) => { await save(input); close(); }} />
          ) : (
            <RecordDrawerBody drawer={drawer} setDrawer={setDrawer} close={close} save={save} remove={remove} />
          )}
        </aside>
      )}
    </div>
  );
}

interface RecordDrawerBodyProps {
  drawer: Extract<Drawer, { record: DataRecord }>;
  setDrawer: (drawer: Drawer) => void;
  close: () => void;
  save: QueryLayoutProps['save'];
  remove: QueryLayoutProps['remove'];
}

function RecordDrawerBody({ drawer, setDrawer, close, save, remove }: RecordDrawerBodyProps) {
  const { record, mode } = drawer;
  const tab = (target: Drawer['mode']) => `drawer-tab${mode === target ? ' active' : ''}`;
  return (
    <>
      <h2 className="drawer-title">{record.name}</h2>
      <nav className="drawer-actions">
        <button type="button" className={tab('details')} aria-label="View details"
          onClick={() => setDrawer({ mode: 'details', record })}>Details</button>
        <button type="button" className={tab('edit')} onClick={() => setDrawer({ mode: 'edit', record })}>Edit</button>
        <button type="button" className={`${tab('confirmDelete')} danger`}
          onClick={() => setDrawer({ mode: 'confirmDelete', record })}>Delete</button>
      </nav>
      {mode === 'details' && (
        <dl className="drawer-details">
          <dt>Owner</dt><dd>{record.owner}</dd>
          <dt>Status</dt><dd>{record.status}</dd>
          <dt>Amount</dt><dd>{formatCurrency(record.amount)}</dd>
        </dl>
      )}
      {mode === 'edit' && (
        <DrawerForm record={record} onCancel={() => setDrawer({ mode: 'details', record })}
          onSave={async (input) => { await save(input, record.id); close(); }} />
      )}
      {mode === 'confirmDelete' && (
        <div className="drawer-confirm">
          <p>This will permanently remove {record.name}.</p>
          <button type="button" className="danger" onClick={async () => { await remove(record.id); close(); }}>Confirm delete</button>
          <button type="button" onClick={() => setDrawer({ mode: 'details', record })}>Keep record</button>
        </div>
      )}
    </>
  );
}

interface DrawerFormProps {
  record?: DataRecord;
  onSave: (input: RecordInput) => Promise<void>;
  onCancel: () => void;
}

function DrawerForm({ record, onSave, onCancel }: DrawerFormProps) {
  const { bind, submit, error } = useRecordDraft(record, onSave);
  return (
    <form className="drawer-form" onSubmit={submit}>
      <div className="float-field"><input aria-label="Name" data-qa="field-name" placeholder=" " {...bind('name')} /><span>Name</span></div>
      <div className="float-field"><input aria-label="Owner" data-qa="field-owner" placeholder=" " {...bind('owner')} /><span>Owner</span></div>
      <div className="float-field"><select aria-label="Status" data-qa="field-status" {...bind('status')}><StatusOptions /></select><span>Status</span></div>
      <div className="float-field"><input aria-label="Amount" data-qa="field-amount" type="number" placeholder=" " {...bind('amount')} /><span>Amount</span></div>
      {error && <div role="alert" className="toast-error">{error}</div>}
      <button type="submit" data-qa="save-record">Save record</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </form>
  );
}
