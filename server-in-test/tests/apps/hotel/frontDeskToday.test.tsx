// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { currentPath, signInAs, TODAY } from './harness';

const section = (name: RegExp) => screen.getByRole('region', { name });
const rowIn = (region: HTMLElement, text: string) => within(region).getByRole('row', { name: new RegExp(text) });
const stat = (label: string) => screen.getByRole('group', { name: label });

describe('front desk: today', () => {
  it('summarises the day', async () => {
    await signInAs('receiving');
    expect(await screen.findByText('Friday, November 20, 2026')).toBeInTheDocument();
    await waitFor(() => expect(stat('Arriving today')).toHaveTextContent('2'));
    expect(stat('Leaving today')).toHaveTextContent('2');
    expect(stat('In the hotel')).toHaveTextContent('4');
    expect(stat('Care rounds done')).toHaveTextContent('0 / 8');
  });

  it('lists arrivals with room, owner and status, and checks a pet in', async () => {
    const { user, hotel } = await signInAs('receiving');
    const arrivals = await screen.findByRole('region', { name: /arriving today/i });
    await within(arrivals).findByText('Pepper');
    const pepper = rowIn(arrivals, 'Pepper');
    expect(pepper).toHaveTextContent('B-301');
    expect(pepper).toHaveTextContent('Kenji Watanabe');
    expect(pepper).toHaveTextContent('Expected');
    expect(rowIn(arrivals, 'Rocky')).toBeInTheDocument();

    await user.click(within(pepper).getByRole('button', { name: /check in/i }));
    await waitFor(() => expect(rowIn(arrivals, 'Pepper')).toHaveTextContent('Checked in'));
    expect(within(rowIn(arrivals, 'Pepper')).queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Pepper is checked in');
    expect(hotel.stays.get('stay-5')?.status).toBe('checked_in');
    await waitFor(() => expect(stat('In the hotel')).toHaveTextContent('5'));
  });

  it('lists departures and checks a pet out', async () => {
    const { user, hotel } = await signInAs('receiving');
    const departures = await screen.findByRole('region', { name: /leaving today/i });
    await within(departures).findByText('Duke');
    expect(rowIn(departures, 'Luna')).toBeInTheDocument();
    await user.click(within(rowIn(departures, 'Duke')).getByRole('button', { name: /check out/i }));
    await waitFor(() => expect(rowIn(departures, 'Duke')).toHaveTextContent('Checked out'));
    expect(hotel.stays.get('stay-3')?.status).toBe('checked_out');
  });

  it('shows the special instructions of arriving pets', async () => {
    await signInAs('receiving');
    const arrivals = await screen.findByRole('region', { name: /arriving today/i });
    expect(await within(arrivals).findByText(/no exercise in the heat/i)).toBeInTheDocument();
  });

  it('links each guest to their pet record', async () => {
    const { user } = await signInAs('receiving');
    const departures = await screen.findByRole('region', { name: /leaving today/i });
    await user.click(await within(departures).findByRole('link', { name: 'Duke' }));
    await waitFor(() => expect(currentPath()).toBe('/hotel/pets/pet-3'));
  });

  it('can look at another day', async () => {
    const { user } = await signInAs('receiving');
    await screen.findByText('Friday, November 20, 2026');
    await user.click(screen.getByRole('button', { name: /next day/i }));
    expect(await screen.findByText('Saturday, November 21, 2026')).toBeInTheDocument();
    const arrivals = section(/arriving/i);
    expect(await within(arrivals).findByText('Hazel')).toBeInTheDocument();
    expect(within(arrivals).queryByRole('button', { name: /check in/i })).not.toBeInTheDocument(); // only on the day
    expect(TODAY).toBe('2026-11-20');
  });
});

describe('front desk: rooms', () => {
  it('shows every room by type with who is staying', async () => {
    await signInAs('receiving', '/rooms');
    const exclusive = await screen.findByRole('region', { name: /exclusive suites/i });
    const e101 = await within(exclusive).findByRole('article', { name: 'E-101' });
    expect(e101).toHaveTextContent('Biscuit');
    expect(within(screen.getByRole('region', { name: /basic kennels/i })).getByRole('article', { name: 'B-306' })).toHaveTextContent('Vacant');
    expect(screen.getByRole('region', { name: /midline rooms/i })).toBeInTheDocument();
    expect(screen.getByText(/4 of 12 occupied/i)).toBeInTheDocument();
  });

  it('does not let the front desk change rooms', async () => {
    await signInAs('receiving', '/rooms');
    await screen.findByRole('region', { name: /exclusive suites/i });
    expect(screen.queryByRole('button', { name: /new room/i })).not.toBeInTheDocument();
  });

  it('lets an admin add a room', async () => {
    const { user, hotel } = await signInAs('admin', '/rooms');
    await user.click(await screen.findByRole('button', { name: /new room/i }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Room name'), 'E-103');
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'exclusive');
    await user.clear(within(dialog).getByLabelText('Nightly rate'));
    await user.type(within(dialog).getByLabelText('Nightly rate'), '135');
    await user.click(within(dialog).getByRole('button', { name: /add room/i }));
    const exclusive = screen.getByRole('region', { name: /exclusive suites/i });
    expect(await within(exclusive).findByRole('article', { name: 'E-103' })).toHaveTextContent('$135');
    expect(hotel.rooms.list().some((r) => r.name === 'E-103')).toBe(true);
  });

  it('lets an admin archive a vacant room but explains why an occupied one cannot be', async () => {
    const { user } = await signInAs('admin', '/rooms');
    const basic = await screen.findByRole('region', { name: /basic kennels/i });
    await user.click(within(within(basic).getByRole('article', { name: 'B-306' })).getByRole('button', { name: /archive/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /archive room/i }));
    await waitFor(() => expect(within(basic).queryByRole('article', { name: 'B-306' })).not.toBeInTheDocument());

    const exclusive = screen.getByRole('region', { name: /exclusive suites/i });
    await user.click(within(within(exclusive).getByRole('article', { name: 'E-101' })).getByRole('button', { name: /archive/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /archive room/i }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Room has an active stay');
  });
});
