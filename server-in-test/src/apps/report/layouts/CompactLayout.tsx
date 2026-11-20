import { formatCurrency } from '../../shared/format';
import type { ReportLayoutProps } from './types';
import { RECORD_STATUSES } from '../../../server/types';

function Kpi({ label, caption, value }: { label: string; caption: string; value: string | number }) {
  return (
    <div className="kpi" role="group" aria-label={label}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-caption">{caption}</div>
    </div>
  );
}

/** v3: compact KPI tiles, status bar chart and icon-only actions. */
export function CompactLayout({ report, refresh, exportCsv }: ReportLayoutProps) {
  const max = Math.max(1, ...Object.values(report.byStatus));
  return (
    <div className="report-compact" data-ui-version="3">
      <div className="compact-top">
        <h1>Insights</h1>
        <div className="icon-actions">
          <button type="button" className="icon-btn" aria-label="Refresh report" onClick={refresh}>⟳</button>
          <button type="button" className="icon-btn" aria-label="Export report as CSV" onClick={exportCsv}>⤓</button>
        </div>
      </div>
      <div className="kpi-grid">
        <Kpi label="Total records" caption="Records" value={report.totalRecords} />
        <Kpi label="Total amount" caption="Value" value={formatCurrency(report.totalAmount)} />
        <Kpi label="Average amount" caption="Avg" value={formatCurrency(report.averageAmount)} />
      </div>
      <div className="status-chart">
        {RECORD_STATUSES.map((status) => (
          <div className="bar-row" role="group" aria-label={status} key={status}>
            <span className="bar-label">{status}</span>
            <div className="bar" style={{ width: `${(report.byStatus[status] / max) * 100}%` }} />
            <span className="bar-value">{report.byStatus[status]}</span>
          </div>
        ))}
      </div>
      <table className="compact-table">
        <caption>By owner</caption>
        <tbody>
          {report.byOwner.map((o) => (
            <tr key={o.owner}>
              <th scope="row"><span className="owner-chip">{o.owner}</span></th>
              <td>{o.count}</td>
              <td>{formatCurrency(o.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
