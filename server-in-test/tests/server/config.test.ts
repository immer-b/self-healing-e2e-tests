import { describe, it, expect } from 'vitest';
import { parseServerConfig } from '../../src/server/config';

describe('parseServerConfig', () => {
  it('defaults to port 3000 and UI version 1', () => {
    expect(parseServerConfig([], {})).toEqual({ port: 3000, uiVersion: 1 });
  });

  it('reads PORT and UI_VERSION from the environment', () => {
    expect(parseServerConfig([], { PORT: '4000', UI_VERSION: '3' })).toEqual({ port: 4000, uiVersion: 3 });
  });

  it('lets --ui-version on the command line override the environment', () => {
    expect(parseServerConfig(['--ui-version=2'], { UI_VERSION: '3' }).uiVersion).toBe(2);
    expect(parseServerConfig(['--ui-version', '3'], {}).uiVersion).toBe(3);
  });

  it('rejects unknown versions', () => {
    expect(() => parseServerConfig(['--ui-version=7'], {})).toThrow(/UI version must be 1, 2 or 3/);
  });
});
