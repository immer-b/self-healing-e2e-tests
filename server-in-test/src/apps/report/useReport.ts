import { useCallback, useEffect, useState } from 'react';
import { api, type Report } from '../shared/api';
import { downloadReportCsv } from './reportCsv';

export function useReport() {
  const [report, setReport] = useState<Report>();

  const refresh = useCallback(async () => {
    setReport(await api.getReport());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const exportCsv = useCallback(() => report && downloadReportCsv(report), [report]);

  return { report, refresh, exportCsv };
}

export interface ReportLayoutProps {
  report: Report;
  refresh: () => void;
  exportCsv: () => void;
}
