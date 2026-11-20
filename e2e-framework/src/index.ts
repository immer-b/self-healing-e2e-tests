/** Public API of the self-healing framework. */
export { createHealer, type Healer, type PageHealer, type HealerOptions, type HealEvent, type LocateSpec } from './healing/healer';
export { scoreFingerprint, rankCandidates, pickBest, DEFAULT_WEIGHTS, type ScoreOptions, type FeatureWeights } from './healing/scoring';
export type { ElementFingerprint, ElementRecord, Candidate } from './fingerprint/types';

export type { ElementStore } from './store/types';
export { createStore, storeConfigFromEnv, DEFAULT_STORE_DIR, type StoreConfig } from './store/createStore';
export { createMemoryStore } from './store/memoryStore';
export { createFileSystemStore } from './store/fileSystemStore';
export { createRemoteStore } from './store/remoteStore';
export { createStoreServer } from './store/storeServer';
export { createDocumentStore, type DocumentCollection } from './store/documentStore';

export { test, expect, formatHealEvent } from './playwright/fixtures';
