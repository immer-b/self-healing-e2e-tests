import { UI_VERSIONS, type UiVersion } from './uiVersion';

/** Small footer to switch between UI versions when exploring the apps manually. */
export function VersionNav({ current }: { current: UiVersion }) {
  return (
    <footer className="version-nav">
      UI version:
      {UI_VERSIONS.map((v) => (
        <a key={v} href={`?v=${v}`} aria-current={v === current ? 'page' : undefined}>
          v{v}
        </a>
      ))}
    </footer>
  );
}
