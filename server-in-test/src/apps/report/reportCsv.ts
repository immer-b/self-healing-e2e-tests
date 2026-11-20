import type { Report } from '../shared/api';

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvRow = (...cells: (string | number)[]) => cells.map(csvCell).join(',');

export function reportToCsv(report: Report): string {
  return [
    csvRow('metric', 'value'),
    csvRow('totalRecords', report.totalRecords),
    csvRow('totalAmount', report.totalAmount),
    csvRow('averageAmount', report.averageAmount),
    ...Object.entries(report.byStatus).map(([status, count]) => csvRow(`status.${status}`, count)),
    '',
    csvRow('owner', 'count', 'amount'),
    ...report.byOwner.map((o) => csvRow(o.owner, o.count, o.amount)),
  ].join('\n');
}

/** Triggers a browser download of the report as CSV. */
export function downloadReportCsv(report: Report, fileName = 'report.csv') {
  const url = URL.createObjectURL(new Blob([reportToCsv(report)], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
