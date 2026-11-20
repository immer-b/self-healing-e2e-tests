import { UI_VERSIONS, type UiVersion } from './uiVersion';

/** Footer to switch the server's UI version while exploring the apps manually. */
export function VersionNav({ current, onChange }: { current: UiVersion; onChange: (version: UiVersion) => void }) {
  return (
    <footer className="version-nav">
      UI version:
      {UI_VERSIONS.map((v) => (
        <button key={v} type="button" aria-pressed={v === current} onClick={() => onChange(v)}>
          v{v}
        </button>
      ))}
    </footer>
  );
}
