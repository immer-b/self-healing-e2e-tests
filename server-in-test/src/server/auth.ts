export interface UserAccount {
  username: string;
  password: string;
  displayName: string;
}

export type AuthResult =
  | { ok: true; token: string; displayName: string }
  | { ok: false; error: string };

export const DEFAULT_USERS: readonly UserAccount[] = [
  { username: 'admin', password: 'password123', displayName: 'Administrator' },
  { username: 'viewer', password: 'viewer123', displayName: 'Read Only Viewer' },
];

export function authenticate(users: readonly UserAccount[], username: string, password: string): AuthResult {
  if (!username || !password) return { ok: false, error: 'Username and password are required' };
  const user = users.find((u) => u.username === username && u.password === password);
  if (!user) return { ok: false, error: 'Invalid username or password' };
  return { ok: true, token: `token-${user.username}-${Date.now().toString(36)}`, displayName: user.displayName };
}
