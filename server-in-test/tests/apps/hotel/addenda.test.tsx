// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { signInAs } from './harness';

describe('note addenda in the UI', () => {
  it('adds a correction under the original note without changing it', async () => {
    const { user, hotel } = await signInAs('receiving', '/pets/pet-1');
    const notes = await screen.findByRole('region', { name: /notes/i });
    const original = (await within(notes).findByText(/settled in well/i)).closest('li')!;
    await user.click(within(original).getByRole('button', { name: /add addendum/i }));
    await user.type(within(original).getByLabelText('Addendum'), 'Correction: he left a little food.');
    await user.click(within(original).getByRole('button', { name: /save addendum/i }));

    const addendum = await within(original).findByRole('article', { name: /addendum/i });
    expect(addendum).toHaveTextContent('Correction: he left a little food.');
    expect(addendum).toHaveTextContent('Priya Shah');
    expect(original).toHaveTextContent('Settled in well. Ate all of his dinner.');
    await waitFor(() => expect(hotel.notes.list('pet-1').find((n) => n.text.startsWith('Correction'))?.amends).toBe('note-1'));
    // addenda are not listed again as top-level notes
    expect(within(notes).getAllByRole('listitem').filter((li) => li.textContent?.includes('Correction'))).toHaveLength(1);
  });
});
