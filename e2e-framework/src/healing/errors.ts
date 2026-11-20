import type { Ranked } from './scoring';
import type { LocateSpec } from './types';

const label = (pageId: string, spec: LocateSpec) => `[self-healing] ${pageId}.${spec.key}`;

export const missingBaselineError = (pageId: string, spec: LocateSpec) =>
  new Error(
    `${label(pageId, spec)}: selector "${spec.selector}" matched nothing and there is no baseline fingerprint ` +
      'to heal from. Run the test once against a known-good UI to record one.',
  );

const formatCandidate = (c: Ranked<{ selector: string }>) => {
  const breakdown = Object.fromEntries(Object.entries(c.breakdown).map(([k, v]) => [k, Number((v ?? 0).toFixed(2))]));
  return `  ${c.score.toFixed(3)} ${c.selector} ${JSON.stringify(breakdown)}`;
};

export const healFailedError = (
  pageId: string,
  spec: LocateSpec,
  threshold: number,
  topCandidates: readonly Ranked<{ selector: string }>[],
) =>
  new Error(
    `${label(pageId, spec)}: could not heal selector "${spec.selector}". ` +
      (topCandidates.length
        ? `No candidate reached the threshold ${threshold}. Top candidates:\n${topCandidates.map(formatCandidate).join('\n')}`
        : 'No candidates found.'),
  );
