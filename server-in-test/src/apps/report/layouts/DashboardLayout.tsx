import { formatCurrency } from '../../shared/format';
import type { ReportLayoutProps } from '../useReport';

function MetricCard({ id, label, value }: { id: string; label: string; value: string | number }) {
  return (
    <div className="metric-card" id={id}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

/** v1: dashboard of metric cards above an owner table, text buttons in the header. */
export function DashboardLayout({ report, refresh, exportCsv }: ReportLayoutProps) {
  return (
    <main className="report-dashboard" data-ui-version="1">
      <header className="report-header">
        <h1>Records Report</h1>
        <button id="refresh-report" type="button" onClick={refresh}>Refresh</button>
        <button id="export-csv" type="button" onClick={exportCsv}>Export CSV</button>
      </header>
      <section className="metrics">
        <MetricCard id="metric-total" label="Total records" value={report.totalRecords} />
        <MetricCard id="metric-amount" label="Total amount" value={formatCurrency(report.totalAmount)} />
        <MetricCard id="metric-average" label="Average amount" value={formatCurrency(report.averageAmount)} />
      </section>
      <section className="metrics status-metrics">
        <MetricCard id="metric-active" label="Active" value={report.byStatus.active} />
        <MetricCard id="metric-inactive" label="Inactive" value={report.byStatus.inactive} />
        <MetricCard id="metric-pending" label="Pending" value={report.byStatus.pending} />
      </section>
      <h2>By owner</h2>
      <table id="owner-table">
        <thead><tr><th>Owner</th><th>Records</th><th>Amount</th></tr></thead>
        <tbody>
          {report.byOwner.map((o) => (
            <tr key={o.owner}>
              <td className="owner-name">{o.owner}</td>
              <td className="owner-count">{o.count}</td>
              <td className="owner-amount">{formatCurrency(o.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
