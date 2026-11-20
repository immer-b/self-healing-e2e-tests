import type { ElementFingerprint } from '../../src/fingerprint/types';

/** Builds a fingerprint with sensible empty defaults for unit tests. */
export function fp(overrides: Partial<ElementFingerprint> & { context?: Partial<ElementFingerprint['context']> } = {}): ElementFingerprint {
  return {
    tag: 'div',
    role: '',
    id: '',
    classes: [],
    attributes: {},
    text: '',
    accessibleName: '',
    path: ['body'],
    childCount: 0,
    textLength: overrides.text?.length ?? 0,
    ...overrides,
    context: { label: '', parentText: '', ancestorLabels: [], ...overrides.context },
  };
}
