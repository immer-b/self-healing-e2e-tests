import type { UiVersion } from '../shared/uiVersion';
import type { LayoutRegistry } from '../shared/versioning';
import { useRecords } from './useRecords';
import { TableLayout } from './layouts/TableLayout';
import { GridLayout } from './layouts/GridLayout';
import { CardDrawerLayout } from './layouts/CardDrawerLayout';
import type { QueryLayoutProps } from './layouts/types';

const LAYOUTS: LayoutRegistry<QueryLayoutProps> = { 1: TableLayout, 2: GridLayout, 3: CardDrawerLayout };

export function QueryApp({ version }: { version: UiVersion }) {
  const model = useRecords();
  const Layout = LAYOUTS[version];
  return <Layout {...model} />;
}
