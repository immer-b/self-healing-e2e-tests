import { readCredentials, type LoginLayoutProps } from './types';

/** v2: centred card, placeholder labels, class-based styling, no ids. */
export function CardLogin({ state, resultsHref, onSubmit }: LoginLayoutProps) {
  return (
    <div className="login-card-page" data-ui-version="2">
      <div className="card">
        {state.displayName ? (
          <>
            <p className="greeting">Hello, {state.displayName}!</p>
            <a className="btn btn-link" href={resultsHref}>Open results</a>
          </>
        ) : (
          <>
            <h2>Welcome back</h2>
            <form className="auth-form" onSubmit={(e) => onSubmit(...readCredentials(e, 'user', 'pass'))}>
              <div className="field">
                <input className="input-user" name="user" placeholder="Username" aria-label="Username" autoComplete="username" />
              </div>
              <div className="field">
                <input className="input-pass" name="pass" type="password" placeholder="Password" aria-label="Password" />
              </div>
              {state.error && <p className="form-error" role="alert">{state.error}</p>}
              <button className="btn btn-primary" type="submit" disabled={state.busy}>Sign in</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
