import { useState, type FormEvent } from 'react';
import { api, type Employee } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../components/Icon';
import { ErrorBanner, Modal, TextField, useToast } from '../components/ui';

const FIELD_LABELS: Record<string, string> = { currentPassword: 'Current password', newPassword: 'New password' };

function PasswordForm({ id, onChanged }: { id: string; onChanged: (employee: Employee) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (next !== confirm) {
      setErrors({ confirm: 'The new passwords do not match' });
      return;
    }
    try {
      const { employee } = await api.changePassword(current, next);
      onChanged(employee);
    } catch (e) {
      const { message, errors: raw } = e as { message: string; errors?: Record<string, string> };
      setErrors(Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, `${FIELD_LABELS[k] ?? k} ${v}`])));
      setGeneral(raw ? undefined : message);
    }
  };

  return (
    <form id={id} className="form" onSubmit={submit} noValidate>
      {general && <ErrorBanner>{general}</ErrorBanner>}
      <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.currentPassword} />
      <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errors.newPassword} hint="At least 8 characters" />
      <TextField label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
    </form>
  );
}

/** Shown instead of the app while the employee is on a temporary password. */
export function ChangePasswordPage() {
  const { refresh, signOut } = useAuth();
  return (
    <div className="login-page login-page-single">
      <div className="login-panel">
        <div className="login-form">
          <div className="brand brand-dark">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="pets" size={20} />
            </span>
            <span>
              <strong>Willow</strong> Pet Hotel
            </span>
          </div>
          <h1>Choose a new password</h1>
          <p className="muted">You signed in with a temporary password. Pick one only you know before continuing.</p>
          <PasswordForm id="first-password-form" onChanged={() => refresh()} />
          <button type="submit" form="first-password-form" className="btn btn-primary btn-block btn-lg">
            Save password
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal
      title="Change password"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="change-password-form" className="btn btn-primary">
            Save password
          </button>
        </>
      }
    >
      <PasswordForm
        id="change-password-form"
        onChanged={() => {
          toast('Password changed');
          onClose();
        }}
      />
    </Modal>
  );
}
