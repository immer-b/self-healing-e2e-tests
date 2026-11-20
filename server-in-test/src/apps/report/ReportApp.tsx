import type { ComponentType } from 'react';
import type { UiVersion } from '../shared/uiVersion';
import { VersionNav } from '../shared/VersionNav';
import { useReport, type ReportLayoutProps } from './useReport';
import { DashboardLayout } from './layouts/DashboardLayout';
import { SidebarLayout } from './layouts/SidebarLayout';
import { CompactLayout } from './layouts/CompactLayout';

const LAYOUTS: Record<UiVersion, ComponentType<ReportLayoutProps>> = {
  1: DashboardLayout,
  2: SidebarLayout,
  3: CompactLayout,
};

export function ReportApp({ version }: { version: UiVersion }) {
  const { report, refresh, exportCsv } = useReport();
  const Layout = LAYOUTS[version];
  return (
    <>
      {report ? <Layout report={report} refresh={refresh} exportCsv={exportCsv} /> : <p>Loading report…</p>}
      <VersionNav current={version} />
    </>
  );
}
