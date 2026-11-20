import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import type { UiVersion } from './uiVersion';
import { useUiVersion } from './useUiVersion';
import { VersionNav } from './VersionNav';
import './base.css';

export type LayoutRegistry<P> = Record<UiVersion, ComponentType<P>>;

type VersionedApp = ComponentType<{ version: UiVersion }>;

/** Renders the layout registered for `version`. */
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
  return <Layout {...props} />;
}

/** Renders `App` with the server's current UI version and re-renders when it changes. */
export function VersionedRoot({ App, pollMs }: { App: VersionedApp; pollMs?: number }) {
  const { version, changeVersion } = useUiVersion(pollMs);
  if (!version) return null;
  return (
    <>
      <App version={version} />
      <VersionNav current={version} onChange={changeVersion} />
    </>
  );
}

/** Entry point helper: mounts an app into #root, driven by the server's UI version. */
export function mountApp(App: VersionedApp) {
  createRoot(document.getElementById('root')!).render(<VersionedRoot App={App} />);
}
