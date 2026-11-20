import { afterEach } from 'vitest';

// Only load DOM helpers when running inside jsdom.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
}
