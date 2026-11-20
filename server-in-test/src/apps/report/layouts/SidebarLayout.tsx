import { formatCurrency } from '../../shared/format';
import type { ReportLayoutProps } from '../useReport';

/** v2: summary definition list in a sidebar, owner breakdown as a list, toolbar at the bottom. */
export function SidebarLayout({ report, refresh, exportCsv }: ReportLayoutProps) {
  return (
    <div className="report-sidebar-page" data-ui-version="2">
      <aside className="summary-sidebar">
        <h2>Report summary</h2>
        <dl>
          <dt>Records</dt><dd data-metric="total">{report.totalRecords}</dd>
          <dt>Total value</dt><dd data-metric="amount">{formatCurrency(report.totalAmount)}</dd>
          <dt>Average value</dt><dd data-metric="average">{formatCurrency(report.averageAmount)}</dd>
          <dt>Active</dt><dd data-metric="active">{report.byStatus.active}</dd>
          <dt>Inactive</dt><dd data-metric="inactive">{report.byStatus.inactive}</dd>
          <dt>Pending</dt><dd data-metric="pending">{report.byStatus.pending}</dd>
        </dl>
      </aside>
      <main className="report-main">
        <h3>Owners</h3>
        <ul className="owner-list">
          {report.byOwner.map((o) => (
            <li key={o.owner}>
              <strong>{o.owner}</strong>
              <span className="muted">{o.count} records</span>
              <span className="amount">{formatCurrency(o.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="report-toolbar">
          <button className="btn-reload" type="button" title="Reload report" onClick={refresh}>↻ Reload</button>
          <button className="btn-download" type="button" title="Download CSV" onClick={exportCsv}>Download CSV</button>
        </div>
      </main>
    </div>
  );
}
