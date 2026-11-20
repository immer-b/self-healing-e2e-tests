// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { signInAs } from './harness';

describe('changing a stay from the pet record', () => {
  it('extends a checked-in stay and moves the pet to another room', async () => {
    const { user, hotel } = await signInAs('receiving', '/pets/pet-1');
    const stays = await screen.findByRole('region', { name: /stays/i });
    await user.click(await within(stays).findByRole('button', { name: /change/i }));
    const dialog = within(screen.getByRole('dialog', { name: /change biscuit/i }));
    expect(dialog.getByLabelText('Check-in')).toBeDisabled(); // already checked in
    const checkOut = dialog.getByLabelText('Check-out');
    await user.clear(checkOut);
    await user.type(checkOut, '2026-11-24');
    const room = dialog.getByLabelText('Room');
    await waitFor(() => expect(within(room).getByRole('option', { name: /E-101/ })).toBeInTheDocument()); // its own room stays available
    await user.selectOptions(room, within(room).getByRole('option', { name: /B-306/ }));
    await user.click(dialog.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(hotel.stays.get('stay-1')).toMatchObject({ checkOut: '2026-11-24', roomId: 'room-12' }));
    expect(await within(stays).findByText('B-306')).toBeInTheDocument();
    expect(within(stays).getByText(/Tue, Nov 24/)).toBeInTheDocument();
  });

  it('offers no change for stays that are over', async () => {
    await signInAs('receiving', '/pets/pet-8');
    const stays = await screen.findByRole('region', { name: /stays/i });
    await within(stays).findByText('Checked out');
    expect(within(stays).queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
  });
});
