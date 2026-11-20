// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { currentPath, signInAs } from './harness';

const table = () => screen.getByRole('table');
const row = (text: string) => within(table()).getByRole('row', { name: new RegExp(text) });
const dialog = () => screen.getByRole('dialog');

describe('admin: employees', () => {
  it('lists active employees with their role and hides archived ones until asked', async () => {
    const { user } = await signInAs('admin', '/employees');
    expect(await screen.findByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
    await screen.findByText('Jordan Lee');
    expect(row('Priya Shah')).toHaveTextContent('Front desk');
    expect(row('Jordan Lee')).toHaveTextContent('General staff');
    expect(screen.queryByText('Riley Park')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/show archived/i));
    expect(await screen.findByText('Riley Park')).toBeInTheDocument();
    expect(row('Riley Park')).toHaveTextContent('Archived');
  });

  it('searches employees', async () => {
    const { user } = await signInAs('admin', '/employees');
    await screen.findByText('Jordan Lee');
    await user.type(screen.getByRole('searchbox', { name: /search employees/i }), 'sam');
    await waitFor(() => expect(screen.queryByText('Jordan Lee')).not.toBeInTheDocument());
    expect(screen.getByText('Sam Rivera')).toBeInTheDocument();
  });

  it('adds an employee with a role and temporary password', async () => {
    const { user, hotel } = await signInAs('admin', '/employees');
    await user.click(await screen.findByRole('button', { name: /new employee/i }));
    const form = within(dialog());
    await user.type(form.getByLabelText('Full name'), 'Casey Nguyen');
    await user.type(form.getByLabelText('Username'), 'casey');
    await user.type(form.getByLabelText('Email'), 'casey@willowpets.test');
    await user.selectOptions(form.getByLabelText('Role'), 'receiving');
    await user.selectOptions(form.getByLabelText('Job type'), 'front_desk');
    await user.type(form.getByLabelText('Temporary password'), 'welcome123');
    await user.click(form.getByRole('button', { name: /add employee/i }));

    expect(await screen.findByText('Casey Nguyen')).toBeInTheDocument();
    expect(row('Casey Nguyen')).toHaveTextContent('Front desk');
    expect(screen.getByRole('status')).toHaveTextContent(/casey nguyen was added/i);
    expect(hotel.employees.authenticate('casey', 'welcome123')).toMatchObject({ role: 'receiving' });
  });

  it('shows field errors from the server', async () => {
    const { user } = await signInAs('admin', '/employees');
    await user.click(await screen.findByRole('button', { name: /new employee/i }));
    const form = within(dialog());
    await user.type(form.getByLabelText('Full name'), 'Another Jordan');
    await user.type(form.getByLabelText('Username'), 'jordan');
    await user.type(form.getByLabelText('Temporary password'), 'short');
    await user.click(form.getByRole('button', { name: /add employee/i }));
    expect(await form.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(dialog()).toBeInTheDocument();
  });

  it('changes an employee’s role', async () => {
    const { user, hotel } = await signInAs('admin', '/employees');
    await screen.findByText('Jordan Lee');
    await user.click(within(row('Jordan Lee')).getByRole('button', { name: /edit/i }));
    await user.selectOptions(within(dialog()).getByLabelText('Role'), 'receiving');
    await user.click(within(dialog()).getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(row('Jordan Lee')).toHaveTextContent('Front desk'));
    expect(hotel.employees.get('emp-3')?.role).toBe('receiving');
  });

  it('archives after confirmation and restores', async () => {
    const { user, hotel } = await signInAs('admin', '/employees');
    await screen.findByText('Sam Rivera');
    await user.click(within(row('Sam Rivera')).getByRole('button', { name: /archive/i }));
    expect(within(dialog()).getByText(/sam rivera will no longer be able to sign in/i)).toBeInTheDocument();
    await user.click(within(dialog()).getByRole('button', { name: /archive employee/i }));
    await waitFor(() => expect(screen.queryByText('Sam Rivera')).not.toBeInTheDocument());
    expect(hotel.employees.get('emp-4')?.deletedAt).toBeTruthy();

    await user.click(screen.getByLabelText(/show archived/i));
    await user.click(within(await screen.findByRole('row', { name: /Sam Rivera/ })).getByRole('button', { name: /restore/i }));
    await waitFor(() => expect(row('Sam Rivera')).not.toHaveTextContent('Archived'));
  });

  it('opens an employee’s change history', async () => {
    const { user } = await signInAs('admin', '/employees');
    await screen.findByText('Jordan Lee');
    await user.click(within(row('Jordan Lee')).getByRole('link', { name: /history/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Change log' })).toBeInTheDocument();
    expect(currentPath()).toBe('/hotel/audit');
    expect(window.location.search).toBe('?entityType=employee&entityId=emp-3');
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2)); // header + the create entry
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Jordan Lee');
  });
});

describe('admin: change log', () => {
  it('shows who changed what and when, newest first', async () => {
    const { user, hotel } = await signInAs('admin', '/audit');
    hotel.pets.update('pet-1', { breed: 'Beagle mix' }, { id: 'emp-2', name: 'Priya Shah' });
    await user.click(await screen.findByRole('button', { name: /refresh/i }));
    const first = await waitFor(() => {
      const r = screen.getAllByRole('row')[1];
      expect(r).toHaveTextContent('Priya Shah');
      return r;
    });
    expect(first).toHaveTextContent('Updated');
    expect(first).toHaveTextContent('Biscuit');
    expect(within(first).getByText('Beagle')).toHaveClass('change-from');
    expect(within(first).getByText('Beagle mix')).toHaveClass('change-to');
    expect(first).toHaveTextContent(/Nov 20, 2026/);
  });

  it('filters by entity type', async () => {
    const { user } = await signInAs('admin', '/audit');
    await screen.findAllByText(/created/i);
    await user.selectOptions(screen.getByLabelText(/entity type/i), 'room');
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(13)); // header + 12 rooms
    expect(window.location.search).toBe('?entityType=room');
  });

  it('collapses the fields of a new record behind a summary', async () => {
    await signInAs('admin', '/audit?entityType=owner&entityId=own-1');
    const row = await screen.findByRole('row', { name: /Dana Whitfield/ });
    const summary = within(row).getByText('4 fields set');
    expect(summary.closest('details')).not.toHaveAttribute('open');
  });
});
