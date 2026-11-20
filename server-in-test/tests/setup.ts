import { afterEach } from 'vitest';

// Only load DOM helpers when running inside jsdom.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup, configure } = await import('@testing-library/react');
  // UI tests talk to a real in-process API; under a full parallel run 1s is too tight.
  configure({ asyncUtilTimeout: 3000 });
  afterEach(() => cleanup());
}
