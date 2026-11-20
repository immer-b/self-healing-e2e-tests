// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { currentPath, renderAt, signInAs, startHotelApi } from './harness';

const navLinks = () =>
  within(screen.getByRole('navigation', { name: /main/i }))
    .getAllByRole('link')
    .map((link) => link.textContent?.trim());

describe('sign in', () => {
  it('shows the sign-in page when nobody is signed in', async () => {
    await startHotelApi();
    renderAt('/pets');
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it('shows an error for bad credentials', async () => {
    await startHotelApi();
    const { user } = renderAt('/');
    await user.type(await screen.findByLabelText(/username/i), 'frontdesk');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password');
  });

  it('keeps the session across a reload', async () => {
    await signInAs('receiving');
    cleanup(); // like closing the tab: the cookie survives, the page state does not
    renderAt('/');
    expect(await screen.findByText('Priya Shah')).toBeInTheDocument();
  });
});

describe('role-based navigation', () => {
  it('lands the front desk on Today with front desk sections', async () => {
    await signInAs('receiving');
    expect(await screen.findByRole('heading', { level: 1, name: /today/i })).toBeInTheDocument();
    expect(currentPath()).toBe('/hotel/today');
    expect(navLinks()).toEqual(['Today', 'Schedule', 'Pets', 'Owners', 'Rooms']);
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText(/front desk/i, { selector: '.user-role' })).toBeInTheDocument();
  });

  it('gives admins staff management and change logs as well', async () => {
    await signInAs('admin');
    await screen.findByRole('heading', { level: 1, name: /today/i });
    expect(navLinks()).toEqual(['Today', 'Schedule', 'Pets', 'Owners', 'Rooms', 'Employees', 'Change log']);
  });

  it('lands general staff on their care queue only', async () => {
    await signInAs('staff');
    expect(await screen.findByRole('heading', { level: 1, name: /my rounds/i })).toBeInTheDocument();
    expect(currentPath()).toBe('/hotel/queue');
    expect(navLinks()).toEqual(['My rounds']);
  });

  it('opens the requested page after sign-in when the role allows it', async () => {
    await signInAs('receiving', '/pets');
    expect(await screen.findByRole('heading', { level: 1, name: /pets/i })).toBeInTheDocument();
  });

  it('sends people away from pages their role cannot use', async () => {
    await signInAs('staff', '/employees');
    expect(await screen.findByRole('heading', { level: 1, name: /my rounds/i })).toBeInTheDocument();
  });

  it('navigates between sections without reloading', async () => {
    const { user } = await signInAs('receiving');
    await user.click(await screen.findByRole('link', { name: 'Owners' }));
    expect(await screen.findByRole('heading', { level: 1, name: /owners/i })).toBeInTheDocument();
    expect(currentPath()).toBe('/hotel/owners');
    expect(screen.getByRole('link', { name: 'Owners' })).toHaveAttribute('aria-current', 'page');
  });

  it('signs out', async () => {
    const { user } = await signInAs('receiving');
    await user.click(await screen.findByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    await waitFor(() => expect(currentPath()).toBe('/hotel/'));
  });
});
