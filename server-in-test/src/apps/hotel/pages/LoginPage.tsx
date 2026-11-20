import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { Icon } from '../components/Icon';
import { ErrorBanner, TextField } from '../components/ui';

export function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await signIn(username.trim(), password);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-art" aria-hidden="true">
        <div className="login-art-inner">
          <span className="brand-mark brand-mark-lg">
            <Icon name="pets" size={32} />
          </span>
          <p className="login-tagline">Every guest, every round, on record.</p>
          <ul className="login-points">
            <li>
              <Icon name="check" /> Arrivals and departures at a glance
            </li>
            <li>
              <Icon name="check" /> Care rounds shared fairly across the team
            </li>
            <li>
              <Icon name="check" /> A permanent log of notes and changes
            </li>
          </ul>
        </div>
      </div>
      <div className="login-panel">
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="brand brand-dark">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="pets" size={20} />
            </span>
            <span>
              <strong>Willow</strong> Pet Hotel
            </span>
          </div>
          <h1>Sign in</h1>
          <p className="muted">Staff portal. Use the account your manager set up for you.</p>
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <TextField label="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
