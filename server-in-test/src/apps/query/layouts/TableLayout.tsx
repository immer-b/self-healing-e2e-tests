import { useState } from 'react';
import type { DataRecord, RecordInput } from '../../shared/api';
import { formatCurrency } from '../../shared/format';
import { useRecordDraft } from '../useRecordDraft';
import { StatusOptions } from './StatusOptions';
import type { QueryLayoutProps } from './types';

type Dialog =
  | { kind: 'view' | 'edit' | 'delete'; record: DataRecord }
  | { kind: 'create' };

/** v1: classic HTML table, "⋯" dropdown menu per row, modal dialogs for every action. */
export function TableLayout({ records, filter, updateFilter, save, remove }: QueryLayoutProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);
  const saveAndClose = (id?: string) => async (input: RecordInput) => {
    await save(input, id);
    close();
  };
  const removeAndClose = (id: string) => async () => {
    await remove(id);
    close();
  };
  const openDialog = (next: Dialog) => {
    setMenuFor(null);
    setDialog(next);
  };

  return (
    <main className="query-table" data-ui-version="1">
      <h1>Results</h1>
      <div className="filters">
        <label htmlFor="search">Search</label>
        <input id="search" type="search" placeholder="Search records" value={filter.text}
          onChange={(e) => updateFilter({ text: e.target.value })} />
        <label htmlFor="status-filter">Status filter</label>
        <select id="status-filter" value={filter.status}
          onChange={(e) => updateFilter({ status: e.target.value as DataRecord['status'] })}>
          <StatusOptions includeAll />
        </select>
        <button id="add-record" type="button" onClick={() => openDialog({ kind: 'create' })}>Add record</button>
      </div>
      <p id="result-count" role="status">{records.length} records</p>
      <table id="results-table">
        <thead>
          <tr><th>Name</th><th>Owner</th><th>Status</th><th>Amount</th><th /></tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr><td colSpan={5} className="empty">No records found</td></tr>
          )}
          {records.map((record) => (
            <tr key={record.id} data-id={record.id}>
              <td className="col-name">{record.name}</td>
              <td className="col-owner">{record.owner}</td>
              <td className="col-status">{record.status}</td>
              <td className="col-amount">{formatCurrency(record.amount)}</td>
              <td className="col-actions">
                <button className="row-menu" type="button" aria-label="Row actions" aria-haspopup="menu"
                  onClick={() => setMenuFor(menuFor === record.id ? null : record.id)}>⋯</button>
                {menuFor === record.id && (
                  <div className="row-menu-list">
                    <button type="button" onClick={() => openDialog({ kind: 'view', record })}>View</button>
                    <button type="button" onClick={() => openDialog({ kind: 'edit', record })}>Edit</button>
                    <button type="button" onClick={() => openDialog({ kind: 'delete', record })}>Delete</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {dialog && (
        <div className="modal-backdrop">
          {dialog.kind === 'view' && <DetailsModal record={dialog.record} onClose={close} />}
          {dialog.kind === 'create' && <FormModal title="New record" onCancel={close}
            onSave={saveAndClose()} />}
          {dialog.kind === 'edit' && <FormModal title="Edit record" record={dialog.record} onCancel={close}
            onSave={saveAndClose(dialog.record.id)} />}
          {dialog.kind === 'delete' && (
            <div role="dialog" aria-label="Confirm deletion" className="modal">
              <p>Delete {dialog.record.name}?</p>
              <button id="confirm-delete" type="button"
                onClick={removeAndClose(dialog.record.id)}>Confirm delete</button>
              <button type="button" onClick={close}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function DetailsModal({ record, onClose }: { record: DataRecord; onClose: () => void }) {
  return (
    <div role="dialog" aria-label="Record details" className="modal" id="details-modal">
      <h2>{record.name}</h2>
      <dl>
        <dt>Owner</dt><dd className="detail-owner">{record.owner}</dd>
        <dt>Status</dt><dd className="detail-status">{record.status}</dd>
        <dt>Amount</dt><dd className="detail-amount">{formatCurrency(record.amount)}</dd>
      </dl>
      <button type="button" onClick={onClose}>Close</button>
    </div>
  );
}

interface FormModalProps {
  title: string;
  record?: DataRecord;
  onSave: (input: RecordInput) => Promise<void>;
  onCancel: () => void;
}

function FormModal({ title, record, onSave, onCancel }: FormModalProps) {
  const { bind, submit, error } = useRecordDraft(record, onSave);
  return (
    <div role="dialog" aria-label={title} className="modal">
      <h2>{title}</h2>
      <form id="record-form" onSubmit={submit}>
        <label htmlFor="record-name">Name</label>
        <input id="record-name" {...bind('name')} />
        <label htmlFor="record-owner">Owner</label>
        <input id="record-owner" {...bind('owner')} />
        <label htmlFor="record-status">Status</label>
        <select id="record-status" {...bind('status')}><StatusOptions /></select>
        <label htmlFor="record-amount">Amount</label>
        <input id="record-amount" type="number" {...bind('amount')} />
        {error && <p role="alert" className="error">{error}</p>}
        <button id="save-record" type="submit">Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </form>
    </div>
  );
}
