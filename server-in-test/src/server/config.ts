import { parseArgs } from 'node:util';
import { UI_VERSIONS, type UiVersion } from './types';

export interface ServerConfig {
  port: number;
  /** Layout served when a page is opened without a ?v= parameter. */
  uiVersion: UiVersion;
}

/**
 * Reads server settings. Command-line flags win over environment variables:
 *   --ui-version=<1|2|3>  or  UI_VERSION   (default 1)
 *   --port=<n>            or  PORT         (default 3000)
 */
export function parseServerConfig(argv: string[], env: Record<string, string | undefined>): ServerConfig {
  const { values } = parseArgs({
    args: argv,
    options: { 'ui-version': { type: 'string' }, port: { type: 'string' } },
    strict: false,
  });
  const rawVersion = values['ui-version'] ?? env.UI_VERSION ?? '1';
  const uiVersion = Number(rawVersion);
  if (!(UI_VERSIONS as readonly number[]).includes(uiVersion)) {
    throw new Error(`UI version must be 1, 2 or 3 (got "${rawVersion}")`);
  }
  return { port: Number(values.port ?? env.PORT ?? 3000), uiVersion: uiVersion as UiVersion };
}
