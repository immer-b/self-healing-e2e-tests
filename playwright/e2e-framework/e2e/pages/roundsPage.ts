import type { Page } from '@playwright/test';
import type { Healer } from '../../src';
import { click, numbersIn, textOf } from './actions';

/**
 * Pet hotel staff rounds: the queue and a single round. Selectors target UI v1 only (list of
 * links, cards with ids, sticky complete bar). v2 (table, switches, inline finish) and v3 (cards,
 * numbered steps) must be reached through the healer.
 */
export function createRoundsPage(page: Page, healer: Healer) {
  const queue = healer.forPage(page, 'hotel.queue');
  const round = healer.forPage(page, 'hotel.round');

  const elements = {
    progress: () => queue.locate({ key: 'progress', selector: '#round-progress', dynamicText: true }),
    rounds: () => queue.locateAll({ key: 'rounds', selector: '#round-queue > li' }),
    roundLink: (index: number) => queue.locate({ key: 'round.link', selector: `#round-queue > li:nth-child(${index + 1}) a.queue-item` }),
    instructions: () => round.locate({ key: 'instructions', selector: '#special-instructions', dynamicText: true }),
    cleaned: () => round.locate({ key: 'cleaned', selector: '#round-cleaned' }),
    fed: () => round.locate({ key: 'fed', selector: '#round-fed' }),
    photo: () => round.locate({ key: 'photo', selector: 'input.round-photo-input' }),
    complete: () => round.locate({ key: 'complete', selector: '#complete-round' }),
  };

  return {
    /** Signs in as a carer. The sign-in form is not versioned, so plain locators are fine here. */
    signIn: async (username = 'jordan', password = 'staff123') => {
      await page.goto('/hotel/');
      await page.getByLabel('Username').fill(username);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.getByRole('button', { name: 'Sign out' }).waitFor();
    },
    /** [done, total] from the progress text ("0 of 3 done", "Completed 0/3", "0 / 3 rounds done"). */
    progress: async () => numbersIn(await textOf(elements.progress)) as [number, number],
    rounds: elements.rounds,
    openRound: (index = 0) => click(() => elements.roundLink(index)),
    instructions: elements.instructions,
    markCleaned: async () => (await elements.cleaned()).check(),
    markFed: async () => (await elements.fed()).check(),
    attachPhoto: async (buffer: Buffer) => (await elements.photo()).setInputFiles({ name: 'room.png', mimeType: 'image/png', buffer }),
    completeButton: elements.complete,
    complete: () => click(elements.complete),
  };
}

export type RoundsPage = ReturnType<typeof createRoundsPage>;
