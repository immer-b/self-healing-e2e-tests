import { describe, it, expect } from 'vitest';
import { authenticate, DEFAULT_USERS } from '../../src/server/auth';

describe('authenticate', () => {
  it('returns a token and user name for valid credentials', () => {
    const result = authenticate(DEFAULT_USERS, 'admin', 'password123');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toMatch(/^token-admin-/);
      expect(result.displayName).toBe('Administrator');
    }
  });

  it('rejects an unknown user or wrong password with a message', () => {
    expect(authenticate(DEFAULT_USERS, 'admin', 'nope')).toEqual({ ok: false, error: 'Invalid username or password' });
    expect(authenticate(DEFAULT_USERS, 'ghost', 'password123').ok).toBe(false);
  });

  it('requires both fields', () => {
    expect(authenticate(DEFAULT_USERS, '', '')).toEqual({ ok: false, error: 'Username and password are required' });
  });
});
