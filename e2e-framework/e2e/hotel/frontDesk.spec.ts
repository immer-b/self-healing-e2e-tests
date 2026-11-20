import { test, expect, signIn } from './fixtures';

test.describe('front desk', () => {
  test('checks in a guest arriving today and checks out a departing one', async ({ page }) => {
    await signIn(page, 'receiving');
    const arrivals = page.getByRole('region', { name: 'Arriving today' });
    await arrivals.getByRole('row', { name: /Pepper/ }).getByRole('button', { name: 'Check in' }).click();
    await expect(arrivals.getByRole('row', { name: /Pepper/ })).toContainText('Checked in');

    const departures = page.getByRole('region', { name: 'Leaving today' });
    await departures.getByRole('row', { name: /Duke/ }).getByRole('button', { name: 'Check out' }).click();
    await expect(departures.getByRole('row', { name: /Duke/ })).toContainText('Checked out');
    await expect(page.getByRole('group', { name: 'In the hotel' })).toContainText('4'); // +Pepper, -Duke
  });

  test('registers a new owner with two contacts, adds their pet and books a room', async ({ page }) => {
    await signIn(page, 'receiving', '/hotel/owners');
    await page.getByRole('button', { name: 'New owner' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Owner name').fill('Nadia Okafor');
    await form.getByLabel('Street address').fill('5 Pine St');
    await form.getByLabel('City').fill('Portland');
    await form.getByLabel('State').fill('OR');
    await form.getByLabel('ZIP code').fill('97201');
    const first = form.getByRole('group', { name: 'Contact 1' });
    await first.getByLabel('Contact name').fill('Nadia Okafor');
    await first.getByLabel('Relationship to pet').fill('Owner');
    await first.getByLabel('Phone number').fill('503-555-0188');
    await form.getByRole('button', { name: 'Add contact' }).click();
    const second = form.getByRole('group', { name: 'Contact 2' });
    await second.getByLabel('Contact name').fill('Tomi Okafor');
    await second.getByLabel('Relationship to pet').fill('Brother');
    await second.getByLabel('Phone number').fill('503-555-0189');
    await form.getByRole('button', { name: 'Save owner' }).click();
    await expect(page.getByRole('row', { name: /Nadia Okafor/ })).toContainText('+1 more contacts');

    await page.getByRole('link', { name: 'Pets' }).click();
    await page.getByRole('button', { name: 'New pet' }).click();
    const petForm = page.getByRole('dialog');
    await petForm.getByLabel('Name', { exact: true }).fill('Ziggy');
    await petForm.getByLabel('Species').selectOption('cat');
    await petForm.getByLabel('Breed').fill('Tabby');
    await petForm.getByLabel('Owner').selectOption({ label: 'Nadia Okafor' });
    await petForm.getByRole('button', { name: 'Add pet' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ziggy' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Contacts' })).toContainText('Tomi Okafor');

    await page.getByRole('button', { name: 'Book a stay' }).click();
    const booking = page.getByRole('dialog');
    await booking.getByLabel('Check-out').fill('2026-11-23');
    await booking.getByLabel('Room').selectOption({ label: 'B-306 · Basic kennel · $45/night' });
    await expect(booking).toContainText('3 nights · estimated $135');
    await booking.getByRole('button', { name: 'Book stay' }).click();
    await expect(page.getByRole('region', { name: 'Stays' })).toContainText('B-306');

    await page.getByRole('link', { name: 'Today' }).click();
    await expect(page.getByRole('region', { name: 'Arriving today' }).getByRole('row', { name: /Ziggy/ })).toContainText('Expected');
  });

  test('schedules tomorrow for the staff on shift and rebalances when someone joins', async ({ page }) => {
    await signIn(page, 'receiving', '/hotel/schedule');
    await page.getByRole('button', { name: 'Next day' }).click();
    await expect(page.getByText('No care rounds scheduled for this day')).toBeVisible();
    const onShift = page.getByRole('region', { name: 'On shift' });
    await onShift.getByRole('checkbox', { name: 'Alex Chen' }).uncheck();
    await page.getByRole('button', { name: 'Generate rounds' }).click();
    await expect(page.getByText('9 rounds created')).toBeVisible();
    const workload = page.getByRole('region', { name: 'Workload' });
    await expect(workload.getByRole('group', { name: 'Jordan Lee' })).toContainText('5 rounds');
    await expect(workload.getByRole('group', { name: 'Alex Chen' })).toContainText('0 rounds');

    await onShift.getByRole('checkbox', { name: 'Alex Chen' }).check();
    await page.getByRole('button', { name: 'Rebalance open rounds' }).click();
    for (const name of ['Jordan Lee', 'Sam Rivera', 'Alex Chen']) {
      await expect(workload.getByRole('group', { name })).toContainText('3 rounds');
    }
  });

  test('adds a permanent note to a pet record', async ({ page }) => {
    await signIn(page, 'receiving', '/hotel/pets/pet-3');
    const notes = page.getByRole('region', { name: 'Notes' });
    await notes.getByLabel('New note').fill('Owner will pick up at 4 PM; bring the orthopedic bed.');
    await notes.getByRole('button', { name: 'Add note' }).click();
    await expect(notes.getByRole('listitem').first()).toContainText('Owner will pick up at 4 PM');
    await expect(notes.getByRole('listitem').first()).toContainText('Priya Shah');
    await expect(notes.getByRole('button', { name: /edit|delete/i })).toHaveCount(0);
  });
});
