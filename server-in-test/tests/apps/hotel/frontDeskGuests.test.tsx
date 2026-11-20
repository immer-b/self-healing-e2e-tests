// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { currentPath, signInAs } from './harness';

const row = (text: string) => within(screen.getByRole('table')).getByRole('row', { name: new RegExp(text) });
const dialog = () => screen.getByRole('dialog');

describe('front desk: owners', () => {
  it('lists owners with their main phone number and pets on file', async () => {
    await signInAs('receiving', '/owners');
    await screen.findByRole('row', { name: /Dana Whitfield/ });
    expect(row('Dana Whitfield')).toHaveTextContent('(503) 555-0101');
    expect(row('Dana Whitfield')).toHaveTextContent('Portland, OR');
    expect(row('Dana Whitfield')).toHaveTextContent('2 pets');
  });

  it('adds an owner with several contacts, each with any number of phone numbers', async () => {
    const { user, hotel } = await signInAs('receiving', '/owners');
    await user.click(await screen.findByRole('button', { name: /new owner/i }));
    const form = within(dialog());
    await user.type(form.getByLabelText('Owner name'), 'Nadia Okafor');
    await user.type(form.getByLabelText('Email'), 'nadia@example.com');
    await user.type(form.getByLabelText('Street address'), '5 Pine St');
    await user.type(form.getByLabelText('City'), 'Portland');
    await user.type(form.getByLabelText('State'), 'OR');
    await user.type(form.getByLabelText('ZIP code'), '97201');

    const first = within(form.getByRole('group', { name: 'Contact 1' }));
    await user.type(first.getByLabelText('Contact name'), 'Nadia Okafor');
    await user.type(first.getByLabelText('Relationship to pet'), 'Owner');
    await user.type(first.getByLabelText('Phone number'), '503-555-0188');

    await user.click(form.getByRole('button', { name: /add contact/i }));
    const second = within(form.getByRole('group', { name: 'Contact 2' }));
    await user.type(second.getByLabelText('Contact name'), 'Tomi Okafor');
    await user.type(second.getByLabelText('Relationship to pet'), 'Brother');
    await user.type(second.getByLabelText('Phone number'), '503-555-0189');
    await user.click(second.getByRole('button', { name: /add phone/i }));
    const phones = second.getAllByLabelText('Phone number');
    await user.type(phones[1], '503-555-0190');
    await user.selectOptions(second.getAllByLabelText('Phone type')[1], 'Work');

    await user.click(form.getByRole('button', { name: /save owner/i }));
    expect(await screen.findByRole('row', { name: /Nadia Okafor/ })).toBeInTheDocument();
    const saved = hotel.owners.list().find((o) => o.name === 'Nadia Okafor')!;
    expect(saved.contacts).toHaveLength(2);
    expect(saved.contacts[1]).toEqual({
      name: 'Tomi Okafor',
      relationship: 'Brother',
      phones: [
        { label: 'Mobile', number: '503-555-0189' },
        { label: 'Work', number: '503-555-0190' },
      ],
    });
  });

  it('shows field errors next to the right inputs', async () => {
    const { user } = await signInAs('receiving', '/owners');
    await user.click(await screen.findByRole('button', { name: /new owner/i }));
    const form = within(dialog());
    await user.type(form.getByLabelText('Owner name'), 'Someone');
    await user.click(form.getByRole('button', { name: /save owner/i }));
    expect(await form.findByText('Street address is required')).toBeInTheDocument();
    expect(form.getByLabelText('Street address')).toHaveAttribute('aria-invalid', 'true');
    expect(within(form.getByRole('group', { name: 'Contact 1' })).getByText('Relationship is required')).toBeInTheDocument();
  });

  it('removes a contact before saving', async () => {
    const { user } = await signInAs('receiving', '/owners');
    await user.click(await screen.findByRole('button', { name: /new owner/i }));
    const form = within(dialog());
    await user.click(form.getByRole('button', { name: /add contact/i }));
    expect(form.getByRole('group', { name: 'Contact 2' })).toBeInTheDocument();
    await user.click(within(form.getByRole('group', { name: 'Contact 2' })).getByRole('button', { name: /remove contact/i }));
    expect(form.queryByRole('group', { name: 'Contact 2' })).not.toBeInTheDocument();
  });

  it('edits an owner', async () => {
    const { user, hotel } = await signInAs('receiving', '/owners');
    await screen.findByRole('row', { name: /Marcus Bell/ });
    await user.click(within(row('Marcus Bell')).getByRole('button', { name: /edit/i }));
    const street = within(dialog()).getByLabelText('Street address');
    await user.clear(street);
    await user.type(street, '90 NW Irving St');
    await user.click(within(dialog()).getByRole('button', { name: /save owner/i }));
    await waitFor(() => expect(hotel.owners.get('own-2')?.address.line1).toBe('90 NW Irving St'));
  });

  it('explains why an owner with pets cannot be archived', async () => {
    const { user } = await signInAs('receiving', '/owners');
    await screen.findByRole('row', { name: /Dana Whitfield/ });
    await user.click(within(row('Dana Whitfield')).getByRole('button', { name: /archive/i }));
    await user.click(within(dialog()).getByRole('button', { name: /archive owner/i }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(/still has pets on file/i);
  });
});

describe('front desk: pets', () => {
  it('lists pets with breed, owner and instructions flag', async () => {
    await signInAs('receiving', '/pets');
    await screen.findByText('Biscuit');
    expect(row('Biscuit')).toHaveTextContent('Beagle');
    expect(row('Biscuit')).toHaveTextContent('Dana Whitfield');
    expect(screen.getAllByRole('row')).toHaveLength(9); // header + 8 pets
  });

  it('searches by pet, breed or owner', async () => {
    const { user } = await signInAs('receiving', '/pets');
    await screen.findByText('Biscuit');
    await user.type(screen.getByRole('searchbox', { name: /search pets/i }), 'watanabe');
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3));
    expect(row('Pepper')).toBeInTheDocument();
    expect(row('Rocky')).toBeInTheDocument();
  });

  it('adds a pet for an owner and opens its record', async () => {
    const { user, hotel } = await signInAs('receiving', '/pets');
    await user.click(await screen.findByRole('button', { name: /new pet/i }));
    const form = within(dialog());
    await user.type(form.getByLabelText('Name'), 'Ziggy');
    await user.selectOptions(form.getByLabelText('Species'), 'cat');
    await user.type(form.getByLabelText('Breed'), 'Tabby');
    await user.selectOptions(await form.findByLabelText('Owner'), 'own-5');
    await user.type(form.getByLabelText('Special instructions'), 'Indoor only.');
    await user.click(form.getByRole('button', { name: /add pet/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ziggy' })).toBeInTheDocument();
    expect(currentPath()).toMatch(/^\/hotel\/pets\/pet-\d+$/);
    expect(hotel.pets.list().find((p) => p.name === 'Ziggy')).toMatchObject({ ownerId: 'own-5', species: 'cat' });
  });

  it('archives a past guest and shows them again with the archived filter', async () => {
    const { user } = await signInAs('receiving', '/pets');
    await screen.findByText('Max');
    await user.click(within(row('Max')).getByRole('button', { name: /archive/i }));
    await user.click(within(dialog()).getByRole('button', { name: /archive pet/i }));
    await waitFor(() => expect(screen.queryByText('Max')).not.toBeInTheDocument());
    await user.click(screen.getByLabelText(/show archived/i));
    await waitFor(() => expect(row('Max')).toHaveTextContent('Archived'));
  });

  it('refuses to archive a pet that is staying with us', async () => {
    const { user } = await signInAs('receiving', '/pets');
    await screen.findByText('Biscuit');
    await user.click(within(row('Biscuit')).getByRole('button', { name: /archive/i }));
    await user.click(within(dialog()).getByRole('button', { name: /archive pet/i }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Pet has an active stay');
  });
});

describe('front desk: pet record', () => {
  it('shows the pet, owner contacts, instructions and stays', async () => {
    await signInAs('receiving', '/pets/pet-1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Biscuit' })).toBeInTheDocument();
    expect(screen.getByText(/grain-free kibble/i)).toBeInTheDocument();
    const contacts = screen.getByRole('region', { name: /contacts/i });
    expect(await within(contacts).findByText('Sam Whitfield')).toBeInTheDocument();
    expect(within(contacts).getByText('(503) 555-0199')).toBeInTheDocument();
    const stays = screen.getByRole('region', { name: /stays/i });
    expect(await within(stays).findByText('E-101')).toBeInTheDocument();
    expect(within(stays).getByText('Checked in')).toBeInTheDocument();
  });

  it('adds a permanent note, newest first, with author and time', async () => {
    const { user } = await signInAs('receiving', '/pets/pet-1');
    const notes = await screen.findByRole('region', { name: /notes/i });
    await within(notes).findByText(/settled in well/i);
    expect(within(notes).getByText(/notes can't be edited or deleted/i)).toBeInTheDocument();
    await user.type(within(notes).getByLabelText('New note'), 'Owner called: pick-up moved to 4 PM.');
    await user.click(within(notes).getByRole('button', { name: /add note/i }));
    const items = await waitFor(() => {
      const list = within(notes).getAllByRole('listitem');
      expect(list[0]).toHaveTextContent('Owner called: pick-up moved to 4 PM.');
      return list;
    });
    expect(items[0]).toHaveTextContent('Priya Shah');
    expect(items[0]).toHaveTextContent(/Nov 20, 2026/);
    expect(within(notes).queryByRole('button', { name: /edit|delete/i })).not.toBeInTheDocument();
    expect(within(notes).getByLabelText('New note')).toHaveValue('');
  });

  it('books a stay in a free room', async () => {
    const { user, hotel } = await signInAs('receiving', '/pets/pet-8');
    await screen.findByRole('heading', { level: 1, name: 'Max' });
    await user.click(screen.getByRole('button', { name: /book a stay/i }));
    const form = within(dialog());
    const checkOut = form.getByLabelText('Check-out');
    await user.clear(checkOut);
    await user.type(checkOut, '2026-11-23');
    const room = await form.findByLabelText('Room');
    await waitFor(() => expect(within(room).queryByRole('option', { name: /E-101/ })).not.toBeInTheDocument());
    await user.selectOptions(room, within(room).getByRole('option', { name: /B-306/ }));
    await user.click(form.getByRole('button', { name: /book stay/i }));
    const stays = screen.getByRole('region', { name: /stays/i });
    expect(await within(stays).findByText('B-306')).toBeInTheDocument();
    expect(within(stays).getByText('Expected')).toBeInTheDocument();
    expect(hotel.stays.list({ petId: 'pet-8', status: 'booked' })).toHaveLength(1);
  });

  it('cancels a booking that has not started', async () => {
    const { user, hotel } = await signInAs('receiving', '/pets/pet-7');
    const stays = await screen.findByRole('region', { name: /stays/i });
    await user.click(await within(stays).findByRole('button', { name: /cancel booking/i }));
    await user.click(within(dialog()).getByRole('button', { name: /cancel booking/i }));
    await waitFor(() => expect(within(stays).getByText('Cancelled')).toBeInTheDocument());
    expect(hotel.stays.get('stay-7')?.status).toBe('cancelled');
  });

  it('edits the pet’s details', async () => {
    const { user, hotel } = await signInAs('receiving', '/pets/pet-5');
    await screen.findByRole('heading', { level: 1, name: 'Pepper' });
    await user.click(screen.getByRole('button', { name: /edit pet/i }));
    await user.type(within(dialog()).getByLabelText('Special instructions'), 'Shy with dogs.');
    await user.click(within(dialog()).getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(screen.getByRole('note', { name: /special instructions/i })).toHaveTextContent('Shy with dogs.'));
    expect(hotel.pets.get('pet-5')?.specialInstructions).toBe('Shy with dogs.');
  });

  it('shows the change history to admins only', async () => {
    const desk = await signInAs('receiving', '/pets/pet-1');
    await screen.findByRole('heading', { level: 1, name: 'Biscuit' });
    expect(screen.queryByRole('link', { name: /change history/i })).not.toBeInTheDocument();
    desk.fetch.mockClear();
  });

  it('links admins to the pet’s change history', async () => {
    const { user } = await signInAs('admin', '/pets/pet-1');
    await screen.findByRole('heading', { level: 1, name: 'Biscuit' });
    await user.click(screen.getByRole('link', { name: /change history/i }));
    await waitFor(() => expect(window.location.search).toBe('?entityType=pet&entityId=pet-1'));
  });
});
