import { describe, it, expect } from 'vitest';
import { createStore, storeConfigFromEnv } from '../../src/store/createStore';

describe('storeConfigFromEnv', () => {
  it('defaults to a filesystem store in .healing-store', () => {
    expect(storeConfigFromEnv({})).toEqual({ type: 'filesystem', dir: '.healing-store' });
  });

  it('reads filesystem and remote settings from environment variables', () => {
    expect(storeConfigFromEnv({ HEALING_STORE_DIR: '/tmp/x' })).toEqual({ type: 'filesystem', dir: '/tmp/x' });
    expect(storeConfigFromEnv({ HEALING_STORE: 'remote', HEALING_STORE_URL: 'http://db:4000', HEALING_STORE_TOKEN: 's3cret' })).toEqual({
      type: 'remote',
      baseUrl: 'http://db:4000',
      token: 's3cret',
    });
  });

  it('rejects a remote store without a URL and unknown types', () => {
    expect(() => storeConfigFromEnv({ HEALING_STORE: 'remote' })).toThrow(/HEALING_STORE_URL/);
    expect(() => storeConfigFromEnv({ HEALING_STORE: 'redis' })).toThrow(/Unknown HEALING_STORE/);
  });
});

describe('createStore', () => {
  it('builds a store for each config type', () => {
    for (const config of [
      { type: 'memory' as const },
      { type: 'filesystem' as const, dir: '.tmp-store' },
      { type: 'remote' as const, baseUrl: 'http://localhost:1' },
    ]) {
      const store = createStore(config);
      expect(typeof store.get).toBe('function');
      expect(typeof store.put).toBe('function');
    }
  });
});

describe('memory store from the environment', () => {
  it('supports HEALING_STORE=memory', () => {
    expect(storeConfigFromEnv({ HEALING_STORE: 'memory' })).toEqual({ type: 'memory' });
  });
});
