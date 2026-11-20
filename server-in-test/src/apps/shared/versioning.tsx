import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { parseUiVersion, readServerUiVersion, type UiVersion } from './uiVersion';
import { VersionNav } from './VersionNav';
import './base.css';

export type LayoutRegistry<P> = Record<UiVersion, ComponentType<P>>;

/** Renders the layout registered for `version` plus the version switcher footer. */
export function VersionedLayout<P extends object>({
  layouts,
  version,
  props,
}: {
  layouts: LayoutRegistry<P>;
  version: UiVersion;
  props: P;
}) {
  const Layout = layouts[version];
  return (
    <>
      <Layout {...props} />
      <VersionNav current={version} />
    </>
  );
}

/** Entry point helper: mounts an app into #root using ?v= if present, otherwise the server's default version. */
export function mountApp(App: ComponentType<{ version: UiVersion }>) {
  const version = parseUiVersion(location.search, readServerUiVersion(document));
  createRoot(document.getElementById('root')!).render(<App version={version} />);
}
