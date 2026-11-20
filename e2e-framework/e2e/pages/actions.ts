import type { Locator } from '@playwright/test';

/** A lazily resolved (and possibly self-healed) element, as returned by `ui.locate(...)` wrappers. */
export type ElementRef = () => Promise<Locator>;

/** Small helpers so page objects read as actions instead of `(await el()).click()` plumbing. */
export const click = async (ref: ElementRef) => (await ref()).click();
export const fill = async (ref: ElementRef, value: string) => (await ref()).fill(value);
export const select = async (ref: ElementRef, value: string) => (await ref()).selectOption(value);
export const textOf = async (ref: ElementRef) => (await ref()).innerText();

/** All numbers in a text, with thousands separators removed ("2 records · $1,650" -> [2, 1650]). */
export const numbersIn = (text: string) => (text.match(/\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
