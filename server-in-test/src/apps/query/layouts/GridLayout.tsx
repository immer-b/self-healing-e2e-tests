import { Fragment, useState } from 'react';
import type { DataRecord, RecordInput } from '../../shared/api';
import { formatCurrency } from '../../shared/format';
import { useRecordDraft } from '../useRecordDraft';
import { StatusOptions } from './StatusOptions';
import type { QueryLayoutProps } from './types';

type RowPanel = { kind: 'details' | 'confirm'; id: string };
type Editor = { record?: DataRecord };

/** v2: ARIA div-grid, popover row menu, inline editor panel and inline row details/confirmation. */
export function GridLayout({ records, filter, updateFilter, save, remove }: QueryLayoutProps) {
  const [popoverFor, setPopoverFor] = useState<string | null>(null);
  const [panel, setPanel] = useState<RowPanel | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  const saveAndCloseEditor = (id?: string) => async (input: RecordInput) => {
    await save(input, id);
    setEditor(null);
  };
  const removeAndClosePanel = (id: string) => async () => {
    await remove(id);
    setPanel(null);
  };

  const choose = (action: () => void) => {
    setPopoverFor(null);
    action();
  };

  return (
    <div className="grid-page" data-ui-version="2">
      <header className="toolbar">
        <h2>Records</h2>
        <input className="toolbar-search" type="search" name="q" aria-label="Filter results" placeholder="Filter…"
          value={filter.text} onChange={(e) => updateFilter({ text: e.target.value })} />
        <select className="toolbar-status" name="status" aria-label="Filter status" value={filter.status}
          onChange={(e) => updateFilter({ status: e.target.value as DataRecord['status'] })}>
          <StatusOptions includeAll />
        </select>
        <span className="count-badge" role="status">{records.length} results</span>
        <button className="btn-new" type="button" onClick={() => setEditor({})}>+ New record</button>
      </header>

      {editor && (
        <EditorPanel key={editor.record?.id ?? 'new'} record={editor.record} onCancel={() => setEditor(null)}
          onSave={saveAndCloseEditor(editor.record?.id)} />
      )}

      <div role="grid" className="data-grid">
        <div role="row" className="grid-row grid-header">
          {['Name', 'Owner', 'Status', 'Amount', ''].map((h) => <span role="columnheader" key={h}>{h}</span>)}
        </div>
        {records.length === 0 && <div className="grid-empty">No records match your filters</div>}
        {records.map((record) => (
          <Fragment key={record.id}>
            <div role="row" className="grid-row" data-key={record.id}>
              <span role="gridcell" className="cell-name">{record.name}</span>
              <span role="gridcell">{record.owner}</span>
              <span role="gridcell"><span className={`pill pill-${record.status}`}>{record.status}</span></span>
              <span role="gridcell">{formatCurrency(record.amount)}</span>
              <span role="gridcell" className="cell-actions">
                <button className="kebab" type="button" title="More options" aria-label="More options"
                  onClick={() => setPopoverFor(popoverFor === record.id ? null : record.id)}>…</button>
                {popoverFor === record.id && (
                  <div className="popover">
                    <button type="button" onClick={() => choose(() => setPanel({ kind: 'details', id: record.id }))}>View details</button>
                    <button type="button" onClick={() => choose(() => setEditor({ record }))}>Edit record</button>
                    <button type="button" onClick={() => choose(() => setPanel({ kind: 'confirm', id: record.id }))}>Delete record</button>
                  </div>
                )}
              </span>
            </div>
            {panel?.id === record.id && panel.kind === 'details' && (
              <section className="row-details" aria-label={`Details for ${record.name}`}>
                <span>Owner: {record.owner}</span>
                <span>Status: {record.status}</span>
                <span>Amount: {formatCurrency(record.amount)}</span>
                <button type="button" className="link" onClick={() => setPanel(null)}>Hide</button>
              </section>
            )}
            {panel?.id === record.id && panel.kind === 'confirm' && (
              <div className="inline-confirm">
                Delete {record.name}?
                <button type="button" className="danger"
                  onClick={removeAndClosePanel(record.id)}>Yes, delete</button>
                <button type="button" onClick={() => setPanel(null)}>No</button>
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

interface EditorPanelProps {
  record?: DataRecord;
  onSave: (input: RecordInput) => Promise<void>;
  onCancel: () => void;
}

function EditorPanel({ record, onSave, onCancel }: EditorPanelProps) {
  const { bind, submit, error } = useRecordDraft(record, onSave);
  const title = record ? 'Edit record' : 'New record';
  return (
    <section className="editor-panel" aria-label={title}>
      <form className="editor-form" onSubmit={submit}>
        <input name="name" placeholder="Record name" aria-label="Record name" {...bind('name')} />
        <input name="owner" placeholder="Owner" aria-label="Owner" {...bind('owner')} />
        <select name="status" aria-label="Record status" {...bind('status')}><StatusOptions /></select>
        <input name="amount" type="number" placeholder="Amount (USD)" aria-label="Amount (USD)" {...bind('amount')} />
        {error && <span role="alert" className="form-error">{error}</span>}
        <button className="btn-save" type="submit">Save changes</button>
        <button type="button" onClick={onCancel}>Discard</button>
      </form>
    </section>
  );
}
