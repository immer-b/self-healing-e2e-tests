import type { Locator } from '@playwright/test';
import type { ElementStore } from '../store/types';
import type { ScoreResult } from './scoring';

export interface HealerOptions {
  store: ElementStore;
  /** Similarity score (0..1) at which a candidate is always accepted. */
  threshold?: number;
  /** Lowest score accepted when the winner leads the runner-up by at least `minMargin`. */
  minScore?: number;
  minMargin?: number;
  /** How long to wait for the primary selector before trying to heal (ms). */
  primaryTimeout?: number;
  /** How long to keep re-scanning the page for a healing candidate (ms). */
  healTimeout?: number;
  /** Replace the stored fingerprint with the healed element's (learn the new UI). Default false. */
  updateBaselineOnHeal?: boolean;
  /** Maximum number of elements fingerprinted per scan. */
  maxCandidates?: number;
  onHeal?: (event: HealEvent) => void;
}

export type HealerSettings = Required<Omit<HealerOptions, 'onHeal'>> & Pick<HealerOptions, 'onHeal'>;

export const DEFAULT_SETTINGS = {
  threshold: 0.6,
  minScore: 0.45,
  minMargin: 0.1,
  primaryTimeout: 1500,
  healTimeout: 3000,
  maxCandidates: 3000,
  updateBaselineOnHeal: false,
} satisfies Partial<HealerSettings>;

export interface LocateSpec {
  /** Stable logical name of the element within the page, e.g. "username" or "row.actions". */
  key: string;
  /** The selector written by the test author (works on the baseline UI). */
  selector: string;
  /** Restrict lookup and healing to this container (e.g. a single table row). */
  scope?: Locator;
  /** The element's text changes between runs (e.g. metric values): rely on its labels instead. */
  dynamicText?: boolean;
  /** Text and surroundings are pure data (set automatically by `locateAll`): compare structure only. */
  ignoreContent?: boolean;
}

export interface HealEvent {
  pageId: string;
  elementKey: string;
  originalSelector: string;
  healedSelector: string;
  score: number;
  breakdown: ScoreResult['breakdown'];
  url: string;
  /** True when a previously healed selector was reused instead of re-scanning the page. */
  fromCache: boolean;
}
