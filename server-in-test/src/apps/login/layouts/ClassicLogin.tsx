import { readCredentials, type LoginLayoutProps } from './types';

/** v1: a plain, id-heavy form with visible labels. */
export function ClassicLogin({ state, resultsHref, onSubmit }: LoginLayoutProps) {
  if (state.displayName) {
    return (
      <main className="login-classic" data-ui-version="1">
        <div id="welcome-message">Welcome, {state.displayName}</div>
        <a id="results-link" href={resultsHref}>View results</a>
      </main>
    );
  }
  return (
    <main className="login-classic" data-ui-version="1">
      <h1>Sign in</h1>
      <form id="login-form" onSubmit={(e) => onSubmit(...readCredentials(e, 'username', 'password'))}>
        <label htmlFor="username">Username</label>
        <input id="username" name="username" type="text" />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" />
        <button id="login-button" type="submit" disabled={state.busy}>Log in</button>
        {state.error && <div id="error-message" role="alert" className="error">{state.error}</div>}
      </form>
    </main>
  );
}
