// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderAt, signInAs } from './harness';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('theme', () => {
  it('follows the system by default', async () => {
    await signInAs('receiving');
    expect(screen.getByRole('combobox', { name: /theme/i })).toHaveValue('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('switches to dark or light and remembers the choice in this browser', async () => {
    const { user } = await signInAs('receiving');
    await user.selectOptions(screen.getByRole('combobox', { name: /theme/i }), 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('hotel-theme')).toBe('dark');

    cleanup();
    delete document.documentElement.dataset.theme;
    renderAt('/');
    expect(await screen.findByRole('combobox', { name: /theme/i })).toHaveValue('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.selectOptions(screen.getByRole('combobox', { name: /theme/i }), 'system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('hotel-theme')).toBeNull();
  });
});
