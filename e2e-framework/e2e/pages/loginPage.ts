import type { Page } from '@playwright/test';
import type { Healer } from '../../src/healing/healer';

/**
 * Login page object. Selectors are written against UI v1 only; on other versions the healer
 * resolves them from the fingerprints recorded during the v1 run.
 */
export function createLoginPage(page: Page, healer: Healer, uiVersion: number) {
  const ui = healer.forPage(page, 'login');

  const elements = {
    username: () => ui.locate({ key: 'username', selector: '#username' }),
    password: () => ui.locate({ key: 'password', selector: '#password' }),
    submitButton: () => ui.locate({ key: 'submit', selector: '#login-button' }),
    errorMessage: () => ui.locate({ key: 'errorMessage', selector: '#error-message' }),
    welcomeMessage: () => ui.locate({ key: 'welcomeMessage', selector: '#welcome-message' }),
    resultsLink: () => ui.locate({ key: 'resultsLink', selector: '#results-link' }),
  };

  const submit = async () => (await elements.submitButton()).click();

  return {
    goto: () => page.goto(`/login/?v=${uiVersion}`),
    submit,
    login: async (username: string, password: string) => {
      await (await elements.username()).fill(username);
      await (await elements.password()).fill(password);
      await submit();
    },
    errorMessage: elements.errorMessage,
    welcomeMessage: elements.welcomeMessage,
    openResults: async () => (await elements.resultsLink()).click(),
  };
}

export type LoginPage = ReturnType<typeof createLoginPage>;
