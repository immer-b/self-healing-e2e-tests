// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { signInAs } from './harness';

function goOffline() {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

function goOnline() {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  localStorage.clear();
});

describe('working offline on a round', () => {
  it('keeps checklist ticks and notes made offline and sends them when back online', async () => {
    const { user, hotel } = await signInAs('staff');
    await waitFor(() => expect(within(screen.getByRole('list', { name: /my rounds/i })).getAllByRole('listitem').length).toBeGreaterThan(0));
    await user.click(within(within(screen.getByRole('list', { name: /my rounds/i })).getAllByRole('listitem')[0]).getByRole('link'));
    await screen.findByRole('checkbox', { name: /room cleaned/i });
    const taskId = window.location.pathname.split('/').pop()!;

    goOffline();
    expect(await screen.findByText(/you're offline/i)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /room cleaned/i }));
    expect(screen.getByRole('checkbox', { name: /room cleaned/i })).toBeChecked();
    const notes = screen.getByRole('region', { name: /notes/i });
    await user.type(within(notes).getByLabelText('New note'), 'Written in the basement, no signal.');
    await user.click(within(notes).getByRole('button', { name: /add note/i }));
    const pendingNote = await within(notes).findByText('Written in the basement, no signal.');
    expect(pendingNote.closest('li')).toHaveTextContent(/waiting to sync/i);
    expect(hotel.tasks.get(taskId)?.cleaned).toBe(false);
    expect(screen.getByText(/2 changes waiting/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete round/i })).toBeDisabled();

    goOnline();
    await waitFor(() => expect(hotel.tasks.get(taskId)?.cleaned).toBe(true));
    expect(hotel.notes.list(hotel.tasks.get(taskId)!.petId)[0]).toMatchObject({ text: 'Written in the basement, no signal.', taskId });
    expect(await screen.findByText(/synced 2 changes/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/you're offline/i)).not.toBeInTheDocument());
  });
});
