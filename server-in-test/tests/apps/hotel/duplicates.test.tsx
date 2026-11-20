// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { signInAs } from './harness';

async function fillNewOwner(user: Awaited<ReturnType<typeof signInAs>>['user'], name: string, phone: string) {
  await user.click(await screen.findByRole('button', { name: /new owner/i }));
  const form = within(screen.getByRole('dialog'));
  await user.type(form.getByLabelText('Owner name'), name);
  await user.type(form.getByLabelText('Street address'), '1 Main St');
  await user.type(form.getByLabelText('City'), 'Portland');
  await user.type(form.getByLabelText('State'), 'OR');
  await user.type(form.getByLabelText('ZIP code'), '97201');
  await user.type(form.getByLabelText('Contact name'), name);
  await user.type(form.getByLabelText('Relationship to pet'), 'Owner');
  await user.type(form.getByLabelText('Phone number'), phone);
  return form;
}

describe('duplicate owner warning', () => {
  it('warns about a likely returning customer before creating a second record, then allows it', async () => {
    const { user, hotel } = await signInAs('receiving', '/owners');
    const form = await fillNewOwner(user, 'Dana Whitfield', '503-555-0101');
    await user.click(form.getByRole('button', { name: /save owner/i }));
    const warning = await form.findByRole('alert');
    expect(warning).toHaveTextContent(/possible duplicate/i);
    expect(warning).toHaveTextContent('Dana Whitfield');
    expect(hotel.owners.list().filter((o) => o.name === 'Dana Whitfield')).toHaveLength(1);

    await user.click(form.getByRole('button', { name: /save anyway/i }));
    await screen.findByText(/was added/i);
    expect(hotel.owners.list().filter((o) => o.name === 'Dana Whitfield')).toHaveLength(2);
  });

  it('saves straight away when nothing matches', async () => {
    const { user, hotel } = await signInAs('receiving', '/owners');
    const form = await fillNewOwner(user, 'Brand New', '971-555-0000');
    await user.click(form.getByRole('button', { name: /save owner/i }));
    await screen.findByText(/brand new was added/i);
    expect(hotel.owners.list().some((o) => o.name === 'Brand New')).toBe(true);
  });
});
