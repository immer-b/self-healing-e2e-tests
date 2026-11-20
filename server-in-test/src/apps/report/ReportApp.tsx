import type { UiVersion } from '../shared/uiVersion';
import { VersionedLayout, type LayoutRegistry } from '../shared/versioning';
import { useReport } from './useReport';
import type { ReportLayoutProps } from './layouts/types';
import { DashboardLayout } from './layouts/DashboardLayout';
import { SidebarLayout } from './layouts/SidebarLayout';
import { CompactLayout } from './layouts/CompactLayout';

const LAYOUTS: LayoutRegistry<ReportLayoutProps> = { 1: DashboardLayout, 2: SidebarLayout, 3: CompactLayout };

export function ReportApp({ version }: { version: UiVersion }) {
  const { report, refresh, exportCsv } = useReport();
  if (!report) return <p>Loading report…</p>;
  return <VersionedLayout layouts={LAYOUTS} version={version} props={{ report, refresh, exportCsv }} />;
}
