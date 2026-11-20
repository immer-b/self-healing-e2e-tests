// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { signInAs, TODAY } from './harness';

const LATE_MORNING = `${TODAY}T10:30:00`;

describe('overdue rounds', () => {
  it('are flagged on the care schedule', async () => {
    await signInAs('receiving', '/schedule', LATE_MORNING);
    const rounds = await screen.findByRole('region', { name: /rounds/i });
    const row = await within(rounds).findByRole('row', { name: /Morning.*Biscuit/ });
    expect(row).toHaveTextContent('Overdue');
    expect(within(rounds).getByRole('row', { name: /Evening.*Pepper/ })).not.toHaveTextContent('Overdue');
  });

  it('are counted on the Today page', async () => {
    await signInAs('receiving', '/', LATE_MORNING);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Care rounds done' })).toHaveTextContent('4 overdue'));
  });

  it('are flagged in a carer’s queue', async () => {
    await signInAs('staff', '/', LATE_MORNING);
    const items = await waitFor(() => {
      const list = within(screen.getByRole('list', { name: /my rounds/i })).getAllByRole('listitem');
      expect(list.length).toBeGreaterThan(0);
      return list;
    });
    expect(items[0]).toHaveTextContent('Overdue');
    expect(items.at(-1)).not.toHaveTextContent('Overdue'); // the evening round
  });
});
