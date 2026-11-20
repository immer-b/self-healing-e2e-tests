import { test as base } from '@playwright/test';
import { createHealer, type Healer, type HealerOptions, type HealEvent } from '../healing/healer';
import { createStore, storeConfigFromEnv } from '../store/createStore';
import type { ElementStore } from '../store/types';

export interface HealingTestFixtures {
  /** Heal events raised during the current test (also added as annotations and a JSON attachment). */
  healEvents: HealEvent[];
}

export interface HealingWorkerFixtures {
  /** Element store selected from HEALING_STORE* environment variables (filesystem by default). */
  elementStore: ElementStore;
  /** Healer tuning, overridable per project via `use: { healerOptions: {...} }`. */
  healerOptions: Omit<HealerOptions, 'store' | 'onHeal'>;
  /**
   * Worker-scoped healer: healed selectors are cached across the tests of a worker, so a broken
   * selector is only re-diagnosed once per page URL.
   */
  healer: Healer;
  /** Internal: routes heal events from the worker-scoped healer to the currently running test. */
  healEventRouter: { current?: (event: HealEvent) => void };
}

export const formatHealEvent = (e: HealEvent) =>
  `${e.pageId}.${e.elementKey}: "${e.originalSelector}" -> "${e.healedSelector}" ` +
  `(score ${e.score}${e.fromCache ? ', cached' : ''})`;

export const test = base.extend<HealingTestFixtures, HealingWorkerFixtures>({
  healerOptions: [{}, { option: true, scope: 'worker' }],

  elementStore: [async ({}, use) => use(createStore(storeConfigFromEnv())), { scope: 'worker' }],

  healEventRouter: [async ({}, use) => use({}), { scope: 'worker' }],

  healer: [
    async ({ elementStore, healerOptions, healEventRouter }, use) =>
      use(createHealer({ ...healerOptions, store: elementStore, onHeal: (e) => healEventRouter.current?.(e) })),
    { scope: 'worker' },
  ],

  healEvents: [
    async ({ healEventRouter }, use, testInfo) => {
      const events: HealEvent[] = [];
      healEventRouter.current = (event) => {
        events.push(event);
        testInfo.annotations.push({ type: 'self-healed', description: formatHealEvent(event) });
      };
      await use(events);
      healEventRouter.current = undefined;
      if (events.length) {
        await testInfo.attach('self-healing.json', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
      }
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
