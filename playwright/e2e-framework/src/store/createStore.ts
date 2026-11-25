import type { ElementStore } from './types';
import { createMemoryStore } from './memoryStore';
import { createFileSystemStore } from './fileSystemStore';
import { createRemoteStore } from './remoteStore';

export type StoreConfig =
  | { type: 'memory' }
  | { type: 'filesystem'; dir: string }
  | { type: 'remote'; baseUrl: string; token?: string };

export const DEFAULT_STORE_DIR = '.healing-store';

/**
 * Reads store settings from the environment:
 *   HEALING_STORE=filesystem|remote|memory (default filesystem)
 *   HEALING_STORE_DIR=<folder>             (filesystem, default .healing-store)
 *   HEALING_STORE_URL=<url>                (remote, required)
 *   HEALING_STORE_TOKEN=<token>            (remote, optional)
 */
export function storeConfigFromEnv(env: Record<string, string | undefined> = process.env): StoreConfig {
  const type = env.HEALING_STORE ?? 'filesystem';
  switch (type) {
    case 'memory':
      return { type };
    case 'filesystem':
      return { type, dir: env.HEALING_STORE_DIR ?? DEFAULT_STORE_DIR };
    case 'remote':
      if (!env.HEALING_STORE_URL) throw new Error('HEALING_STORE=remote requires HEALING_STORE_URL');
      return { type, baseUrl: env.HEALING_STORE_URL, ...(env.HEALING_STORE_TOKEN ? { token: env.HEALING_STORE_TOKEN } : {}) };
    default:
      throw new Error(`Unknown HEALING_STORE "${type}" (expected filesystem, remote or memory)`);
  }
}

export function createStore(config: StoreConfig): ElementStore {
  switch (config.type) {
    case 'memory':
      return createMemoryStore();
    case 'filesystem':
      return createFileSystemStore({ dir: config.dir });
    case 'remote':
      return createRemoteStore({ baseUrl: config.baseUrl, token: config.token });
  }
}
