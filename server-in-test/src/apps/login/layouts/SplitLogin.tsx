import { readCredentials, type LoginLayoutProps } from './types';

/** v3: split screen with branding panel, floating labels and data-qa hooks. */
export function SplitLogin({ state, resultsHref, onSubmit }: LoginLayoutProps) {
  return (
    <section className="login-split" data-ui-version="3">
      <aside className="brand-panel">
        <span className="logo">◆</span> Acme Portal
      </aside>
      <div className="form-panel">
        {state.displayName ? (
          <div role="status" className="signed-in">
            <p>Signed in as <strong>{state.displayName}</strong></p>
            <a data-qa="go-results" href={resultsHref}>Continue to results →</a>
          </div>
        ) : (
          <form aria-label="Login form" onSubmit={(e) => onSubmit(...readCredentials(e, 'login', 'secret'))}>
            <h1>Account access</h1>
            <div className="float-field">
              <input id="login-email" name="login" aria-label="Username" data-qa="login-user" placeholder=" " />
              <span className="float-label">Username</span>
            </div>
            <div className="float-field">
              <input id="login-secret" name="secret" type="password" aria-label="Password" data-qa="login-pass" placeholder=" " />
              <span className="float-label">Password</span>
            </div>
            <button data-qa="submit-login" type="submit" disabled={state.busy}>
              <span>Continue</span> <span aria-hidden="true">→</span>
            </button>
            {state.error && <div className="toast toast-error" role="alert">{state.error}</div>}
          </form>
        )}
      </div>
    </section>
  );
}
