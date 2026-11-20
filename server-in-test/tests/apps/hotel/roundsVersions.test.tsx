// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { currentPath, signInAs, TODAY } from './harness';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const linkClassesByVersion = new Map<number, string>();

/**
 * The staff rounds pages exist in three layouts (switched with PUT /api/ui-version) so the
 * self-healing tests have a realistic app to heal against. Behaviour must be the same in all three,
 * queried by role and accessible name; only the markup differs.
 */
describe.each([1, 2, 3] as const)('rounds pages, UI v%i', (version) => {
  const layout = () => document.querySelector(`[data-ui-version="${version}"]`);

  it('lists my rounds with progress in this layout', async () => {
    const { hotel } = await signInAs('staff', '/', `${TODAY}T08:00:00`, version);
    await waitFor(() => expect(layout()).not.toBeNull());
    const mine = hotel.tasks.queue('emp-3', TODAY);
    expect(await screen.findByText(new RegExp(`0\\s*(of|/)\\s*${mine.length}`))).toBeInTheDocument();
    for (const task of mine) expect(screen.getAllByText(new RegExp(task.pet!.name)).length).toBeGreaterThan(0);
    linkClassesByVersion.set(version, within(document.querySelector('main')!).getAllByRole('link').map((a) => a.className).join(' '));
  });

  it('works a round from start to finish and returns to the queue', async () => {
    const { user, hotel } = await signInAs('staff', '/', `${TODAY}T08:00:00`, version);
    await waitFor(() => expect(layout()).not.toBeNull());
    const [first] = hotel.tasks.queue('emp-3', TODAY);
    const links = await screen.findAllByRole('link', { name: new RegExp(first.pet!.name) });
    await user.click(links[0]);
    await waitFor(() => expect(currentPath()).toBe(`/hotel/queue/${first.id}`));
    await waitFor(() => expect(layout()).not.toBeNull());

    expect(await screen.findByText(first.pet!.specialInstructions)).toBeInTheDocument();
    const complete = screen.getByRole('button', { name: /complete|finish/i });
    expect(complete).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /clean/i }));
    await user.click(screen.getByRole('checkbox', { name: /fed|feed/i }));
    await user.upload(screen.getByLabelText(/photo/i, { selector: 'input[type=file]' }), new File([PNG], 'room.png', { type: 'image/png' }));
    await waitFor(() => expect(complete).toBeEnabled());
    await user.click(complete);

    await waitFor(() => expect(currentPath()).toBe('/hotel/queue'));
    expect(hotel.tasks.get(first.id)?.status).toBe('completed');
    expect(await screen.findByText(/1\s*(of|\/)\s*3/)).toBeInTheDocument();
  });
});

describe('layouts really differ', () => {
  it('uses different markup per version', () => {
    expect(linkClassesByVersion.size).toBe(3);
    expect(new Set(linkClassesByVersion.values()).size).toBe(3);
  });
});
