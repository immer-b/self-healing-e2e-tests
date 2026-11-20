// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, renderHook, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUiVersion } from '../../src/apps/shared/useUiVersion';
import { VersionedRoot } from '../../src/apps/shared/versioning';
import type { UiVersion } from '../../src/apps/shared/uiVersion';
import { mockFetch } from './testUtils';

let serverVersion: UiVersion;
let fetchMock: ReturnType<typeof mockFetch>;

beforeEach(() => {
  serverVersion = 1;
  fetchMock = mockFetch({
    'GET /api/ui-version': () => ({ body: { version: serverVersion } }),
    'PUT /api/ui-version': (init) => {
      serverVersion = JSON.parse(String(init?.body)).version;
      return { body: { version: serverVersion } };
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('useUiVersion', () => {
  it('loads the current version from the server', async () => {
    serverVersion = 2;
    const { result } = renderHook(() => useUiVersion(20));
    expect(result.current.version).toBeUndefined();
    await waitFor(() => expect(result.current.version).toBe(2));
  });

  it('picks up a version changed elsewhere by polling', async () => {
    const { result } = renderHook(() => useUiVersion(20));
    await waitFor(() => expect(result.current.version).toBe(1));
    serverVersion = 3;
    await waitFor(() => expect(result.current.version).toBe(3));
  });

  it('changes the version on the server', async () => {
    const { result } = renderHook(() => useUiVersion(10_000));
    await waitFor(() => expect(result.current.version).toBe(1));
    await act(() => result.current.changeVersion(2));
    expect(result.current.version).toBe(2);
    expect(serverVersion).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith('/api/ui-version', expect.objectContaining({ method: 'PUT' }));
  });
});

describe('VersionedRoot', () => {
  const App = ({ version }: { version: UiVersion }) => <p>layout v{version}</p>;

  it('renders the app with the server version and swaps it live', async () => {
    render(<VersionedRoot App={App} pollMs={20} />);
    expect(await screen.findByText('layout v1')).toBeInTheDocument();
    serverVersion = 3;
    expect(await screen.findByText('layout v3')).toBeInTheDocument();
  });

  it('offers footer buttons that switch the version', async () => {
    render(<VersionedRoot App={App} pollMs={10_000} />);
    await screen.findByText('layout v1');
    await userEvent.click(screen.getByRole('button', { name: 'v2' }));
    expect(await screen.findByText('layout v2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'v2' })).toHaveAttribute('aria-pressed', 'true');
  });
});
