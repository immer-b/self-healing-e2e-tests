// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { signInAs } from './harness';

describe('pet profile', () => {
  it('shows age, weight, vet and vaccinations with their status', async () => {
    await signInAs('receiving', '/pets/pet-3');
    const profile = await screen.findByRole('region', { name: 'Profile' });
    expect(profile).toHaveTextContent('82 lb');
    expect(profile).toHaveTextContent(/10 years/);
    expect(profile).toHaveTextContent('Pearl District Vet');
    const rabies = within(profile).getByRole('listitem', { name: /rabies/i });
    expect(rabies).toHaveTextContent('Expired');
    expect(within(profile).getByRole('listitem', { name: /dhpp/i })).toHaveTextContent('Current');
  });

  it('warns at the top of the record when a vaccination has lapsed', async () => {
    await signInAs('receiving', '/pets/pet-3');
    expect(await screen.findByText(/rabies vaccination expired/i)).toBeInTheDocument();
  });

  it('edits the profile, including adding a vaccination', async () => {
    const { user, hotel } = await signInAs('receiving', '/pets/pet-5');
    await screen.findByRole('heading', { level: 1, name: 'Pepper' });
    await user.click(screen.getByRole('button', { name: /edit pet/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Weight (lb)'), '14');
    await user.type(dialog.getByLabelText('Vet name'), 'Lake Oswego Cat Clinic');
    await user.click(dialog.getByRole('button', { name: /add vaccination/i }));
    await user.type(dialog.getByLabelText('Vaccine'), 'FVRCP');
    await user.type(dialog.getByLabelText('Expires on'), '2027-02-01');
    await user.click(dialog.getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(hotel.pets.get('pet-5')).toMatchObject({ weightLbs: 14, vet: { name: 'Lake Oswego Cat Clinic' }, vaccinations: [{ name: 'FVRCP', expiresOn: '2027-02-01' }] }),
    );
    expect(await within(screen.getByRole('region', { name: 'Profile' })).findByRole('listitem', { name: /fvrcp/i })).toHaveTextContent('Current');
  });
});
