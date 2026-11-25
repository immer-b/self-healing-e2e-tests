import type { Page } from '@playwright/test';
import type { Healer } from '../../src';
import { click, fill } from './actions';

/**
 * Login page object. Selectors are written against UI v1 only; on other versions the healer
 * resolves them from the fingerprints recorded during the v1 run.
 */
export function createLoginPage(page: Page, healer: Healer) {
  const ui = healer.forPage(page, 'login');

  const elements = {
    username: () => ui.locate({ key: 'username', selector: '#username' }),
    password: () => ui.locate({ key: 'password', selector: '#password' }),
    submitButton: () => ui.locate({ key: 'submit', selector: '#login-button' }),
    errorMessage: () => ui.locate({ key: 'errorMessage', selector: '#error-message' }),
    welcomeMessage: () => ui.locate({ key: 'welcomeMessage', selector: '#welcome-message' }),
    resultsLink: () => ui.locate({ key: 'resultsLink', selector: '#results-link' }),
  };

  const submit = () => click(elements.submitButton);

  return {
    goto: () => page.goto('/login/'),
    submit,
    login: async (username: string, password: string) => {
      await fill(elements.username, username);
      await fill(elements.password, password);
      await submit();
    },
    errorMessage: elements.errorMessage,
    welcomeMessage: elements.welcomeMessage,
    openResults: () => click(elements.resultsLink),
  };
}

export type LoginPage = ReturnType<typeof createLoginPage>;
