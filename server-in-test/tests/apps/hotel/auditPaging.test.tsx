// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { signInAs } from './harness';

const dataRows = () => screen.getAllByRole('row').length - 1;

describe('change log paging', () => {
  it('loads 50 entries and more on request', async () => {
    const { user } = await signInAs('admin', '/audit');
    await waitFor(() => expect(dataRows()).toBe(50));
    await user.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => expect(dataRows()).toBeGreaterThan(50));
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('filters by date range', async () => {
    const { user } = await signInAs('admin', '/audit');
    await waitFor(() => expect(dataRows()).toBe(50));
    await user.type(screen.getByLabelText('From'), '2026-11-21');
    await waitFor(() => expect(screen.getByText(/no changes recorded/i)).toBeInTheDocument());
    expect(window.location.search).toContain('from=2026-11-21');
  });
});
