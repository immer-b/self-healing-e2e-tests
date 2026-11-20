import { test as base } from '@playwright/test';
import { createHealer, type Healer, type HealerOptions, type HealEvent } from '../healing/healer';
import { createStore, storeConfigFromEnv } from '../store/createStore';
import type { ElementStore } from '../store/types';

export interface HealingTestFixtures {
  /** A healer bound to the current test; heal events are reported as annotations + an attachment. */
  healer: Healer;
  /** Heal events raised during the current test. */
  healEvents: HealEvent[];
}

export interface HealingWorkerFixtures {
  /** Element store selected from HEALING_STORE* environment variables (filesystem by default). */
  elementStore: ElementStore;
  /** Healer tuning, overridable per project via `use: { healerOptions: {...} }`. */
  healerOptions: Omit<HealerOptions, 'store' | 'onHeal'>;
}

export const formatHealEvent = (e: HealEvent) =>
  `${e.pageId}.${e.elementKey}: "${e.originalSelector}" -> "${e.healedSelector}" (score ${e.score})`;

export const test = base.extend<HealingTestFixtures, HealingWorkerFixtures>({
  healerOptions: [{}, { option: true, scope: 'worker' }],

  elementStore: [async ({}, use) => use(createStore(storeConfigFromEnv())), { scope: 'worker' }],

  healEvents: async ({}, use) => use([]),

  healer: async ({ elementStore, healerOptions, healEvents }, use, testInfo) => {
    const healer = createHealer({
      ...healerOptions,
      store: elementStore,
      onHeal: (event) => {
        healEvents.push(event);
        testInfo.annotations.push({ type: 'self-healed', description: formatHealEvent(event) });
      },
    });
    await use(healer);
    if (healEvents.length) {
      await testInfo.attach('self-healing.json', {
        body: JSON.stringify(healEvents, null, 2),
        contentType: 'application/json',
      });
    }
  },
});

export { expect } from '@playwright/test';
