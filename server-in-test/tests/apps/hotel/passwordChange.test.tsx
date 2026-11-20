// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderAt, startHotelApi } from './harness';

async function signInFresh(username: string, password: string) {
  const { user } = renderAt('/');
  await user.type(await screen.findByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return { user };
}

describe('password changes in the UI', () => {
  it('asks a new employee to choose their own password before anything else', async () => {
    const { hotel } = await startHotelApi();
    hotel.employees.create(
      { name: 'Casey Nguyen', username: 'casey', email: '', phone: '', role: 'receiving', type: 'front_desk', password: 'temporary1' },
      { id: 'emp-1', name: 'Morgan Reyes' },
    );
    const { user } = await signInFresh('casey', 'temporary1');

    expect(await screen.findByRole('heading', { name: /choose a new password/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /main/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Current password'), 'temporary1');
    await user.type(screen.getByLabelText('New password'), 'my-own-secret');
    await user.type(screen.getByLabelText('Confirm new password'), 'my-own-secret');
    await user.click(screen.getByRole('button', { name: /save password/i }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(hotel.employees.authenticate('casey', 'my-own-secret')).toBeTruthy();
  });

  it('checks the confirmation matches before sending', async () => {
    const { hotel } = await startHotelApi();
    hotel.employees.update('emp-3', { password: 'reset-by-admin' }, { id: 'emp-1', name: 'Morgan Reyes' });
    const { user } = await signInFresh('jordan', 'reset-by-admin');
    await user.type(await screen.findByLabelText('Current password'), 'reset-by-admin');
    await user.type(screen.getByLabelText('New password'), 'one-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'another-password');
    await user.click(screen.getByRole('button', { name: /save password/i }));
    expect(await screen.findByText('The new passwords do not match')).toBeInTheDocument();
  });

  it('lets anyone change their password from the sidebar', async () => {
    const { hotel } = await startHotelApi();
    const { user } = await signInFresh('jordan', 'staff123');
    await user.click(await screen.findByRole('button', { name: /change password/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Current password'), 'staff123');
    await user.type(dialog.getByLabelText('New password'), 'jordans-new-pw');
    await user.type(dialog.getByLabelText('Confirm new password'), 'jordans-new-pw');
    await user.click(dialog.getByRole('button', { name: /save password/i }));
    expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
    expect(hotel.employees.authenticate('jordan', 'jordans-new-pw')).toBeTruthy();
  });
});
