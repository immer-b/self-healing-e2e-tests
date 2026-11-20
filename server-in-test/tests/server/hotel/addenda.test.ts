import { describe, expect, it } from 'vitest';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';

const jordan = { id: 'emp-3', name: 'Jordan Lee' };

function setup() {
  const hotel = createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) });
  const original = hotel.notes.add('pet-1', { text: 'Gave 2 cups of food.' }, jordan).value!;
  return { hotel, original };
}

describe('note addenda', () => {
  it('links a correction to the original note, which stays unchanged', () => {
    const { hotel, original } = setup();
    const addendum = hotel.notes.add('pet-1', { text: 'Correction: it was 1 cup.', amends: original.id }, jordan);
    expect(addendum.value).toMatchObject({ amends: original.id, text: 'Correction: it was 1 cup.' });
    expect(hotel.notes.get(original.id)).toMatchObject({ text: 'Gave 2 cups of food.', amends: null });
  });

  it('attaches an addendum of an addendum to the original note', () => {
    const { hotel, original } = setup();
    const first = hotel.notes.add('pet-1', { text: 'First fix', amends: original.id }, jordan).value!;
    const second = hotel.notes.add('pet-1', { text: 'Second fix', amends: first.id }, jordan).value!;
    expect(second.amends).toBe(original.id);
  });

  it('only amends notes about the same pet', () => {
    const { hotel, original } = setup();
    expect(hotel.notes.add('pet-2', { text: 'x', amends: original.id }, jordan)).toMatchObject({
      ok: false,
      status: 400,
      errors: { amends: 'does not match a note for this pet' },
    });
    expect(hotel.notes.add('pet-1', { text: 'x', amends: 'note-404' }, jordan).ok).toBe(false);
  });

  it('records the link in the change log', () => {
    const { hotel, original } = setup();
    const addendum = hotel.notes.add('pet-1', { text: 'Fix', amends: original.id }, jordan).value!;
    expect(hotel.audit.list({ entityId: addendum.id })[0].changes).toContainEqual({ field: 'amends', from: null, to: original.id });
  });
});
