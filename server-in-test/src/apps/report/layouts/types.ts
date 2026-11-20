import type { Report } from '../../shared/api';

export interface ReportLayoutProps {
  report: Report;
  refresh: () => void;
  exportCsv: () => void;
}
