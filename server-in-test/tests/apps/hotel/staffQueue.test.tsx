// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { currentPath, signInAs } from './harness';
import type { Hotel } from '../../../src/server/hotel/hotel';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const queueItems = () => within(screen.getByRole('list', { name: /my rounds/i })).getAllByRole('listitem');
const firstPending = (hotel: Hotel) => hotel.tasks.queue('emp-3', '2026-11-20')[0];

describe('general staff: my rounds', () => {
  it('lists my rounds for today, pending first, with room and instructions', async () => {
    const { hotel } = await signInAs('staff');
    expect(await screen.findByRole('heading', { level: 1, name: /my rounds/i })).toBeInTheDocument();
    const mine = hotel.tasks.queue('emp-3', '2026-11-20');
    await waitFor(() => expect(queueItems()).toHaveLength(mine.length));
    expect(screen.getByText(`0 of ${mine.length} done`)).toBeInTheDocument();
    const first = queueItems()[0];
    expect(first).toHaveTextContent(mine[0].pet!.name);
    expect(first).toHaveTextContent(mine[0].room!.name);
    expect(first).toHaveTextContent(mine[0].slot === 'morning' ? 'AM' : 'PM');
  });

  it('opens a round with the pet’s instructions and emergency contacts', async () => {
    const { user, hotel } = await signInAs('staff');
    const task = firstPending(hotel);
    await openFirstRound(user);
    expect(currentPath()).toBe(`/hotel/queue/${task.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: task.pet!.name })).toBeInTheDocument();
    if (task.pet!.specialInstructions) {
      expect(screen.getByRole('note', { name: /special instructions/i })).toHaveTextContent(task.pet!.specialInstructions);
    }
    const contacts = screen.getByRole('region', { name: /emergency contacts/i });
    expect(within(contacts).getByText(task.owner!.contacts[0].phones[0].number)).toBeInTheDocument();
  });

  it('saves the checklist as it is ticked', async () => {
    const { user, hotel } = await signInAs('staff');
    const task = firstPending(hotel);
    await openFirstRound(user, task.pet!.name);
    await user.click(screen.getByRole('checkbox', { name: /room cleaned/i }));
    await user.click(screen.getByRole('checkbox', { name: /fed/i }));
    await waitFor(() => expect(hotel.tasks.get(task.id)).toMatchObject({ cleaned: true, fed: true }));
    expect(screen.getByRole('checkbox', { name: /room cleaned/i })).toBeChecked();
  });

  it('uploads a photo of the pet in the room and previews it', async () => {
    const { user, hotel } = await signInAs('staff');
    const task = firstPending(hotel);
    await openFirstRound(user, task.pet!.name);
    await user.upload(screen.getByLabelText(/photo of the pet in the room/i), new File([PNG], 'room.png', { type: 'image/png' }));
    const preview = await screen.findByRole('img', { name: `${task.pet!.name} in ${task.room!.name}` });
    await waitFor(() => expect(hotel.tasks.get(task.id)?.photoId).toMatch(/^pho-/));
    expect(preview).toHaveAttribute('src', `/api/hotel/photos/${hotel.tasks.get(task.id)!.photoId}`);
  });

  it('adds a note linked to the round', async () => {
    const { user, hotel } = await signInAs('staff');
    const task = firstPending(hotel);
    await openFirstRound(user, task.pet!.name);
    const notes = screen.getByRole('region', { name: /notes/i });
    await user.type(within(notes).getByLabelText('New note'), 'Ate everything, very playful.');
    await user.click(within(notes).getByRole('button', { name: /add note/i }));
    await within(notes).findByText('Ate everything, very playful.');
    expect(hotel.notes.list(task.petId)[0]).toMatchObject({ text: 'Ate everything, very playful.', taskId: task.id, createdBy: { name: 'Jordan Lee' } });
  });

  it('only allows completing once cleaned, fed and photographed, then returns to the queue', async () => {
    const { user, hotel } = await signInAs('staff');
    const task = firstPending(hotel);
    await openFirstRound(user, task.pet!.name);
    const complete = screen.getByRole('button', { name: /complete round/i });
    expect(complete).toBeDisabled();
    expect(screen.getByText(/still to do: clean the room, feed, add a photo/i)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /room cleaned/i }));
    await user.click(screen.getByRole('checkbox', { name: /fed/i }));
    await user.upload(screen.getByLabelText(/photo of the pet in the room/i), new File([PNG], 'room.png', { type: 'image/png' }));
    await waitFor(() => expect(complete).toBeEnabled());
    await user.click(complete);

    expect(await screen.findByRole('heading', { level: 1, name: /my rounds/i })).toBeInTheDocument();
    expect(currentPath()).toBe('/hotel/queue');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`${task.pet!.name}.*complete`, 'i')));
    expect(hotel.tasks.get(task.id)?.status).toBe('completed');
    await waitFor(() => expect(queueItems().at(-1)).toHaveTextContent('Done'));
    expect(queueItems()[0]).not.toHaveTextContent('Done');
    expect(screen.getByText(/1 of \d+ done/)).toBeInTheDocument();
  });

  it('shows a completed round read-only', async () => {
    const { user, hotel } = await signInAs('staff');
    const task = firstPending(hotel);
    const jordan = { id: 'emp-3', name: 'Jordan Lee' };
    hotel.tasks.update(task.id, { cleaned: true, fed: true }, jordan);
    hotel.tasks.attachPhoto(task.id, 'pho-x', jordan);
    hotel.tasks.complete(task.id, jordan);
    await user.click(await screen.findByRole('button', { name: /refresh/i }));
    await user.click(await screen.findByRole('link', { name: new RegExp(`${task.pet!.name}.*Done`) }));
    expect(await screen.findByText(/completed at/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /room cleaned/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /complete round/i })).not.toBeInTheDocument();
  });
});

type User = ReturnType<typeof import('@testing-library/user-event').default.setup>;

/** Opens the first (pending) round in the queue and waits for its page. */
async function openFirstRound(user: User, petName?: string) {
  await waitFor(() => expect(queueItems().length).toBeGreaterThan(0));
  await user.click(within(queueItems()[0]).getByRole('link'));
  if (petName) await screen.findByRole('heading', { level: 1, name: petName });
}
