import { Router } from 'express';
import { authenticate, type UserAccount } from '../auth';

export function authRoutes(users: readonly UserAccount[]) {
  return Router().post('/login', (req, res) => {
    const { username = '', password = '' } = req.body ?? {};
    const result = authenticate(users, username, password);
    if (result.ok) res.json({ token: result.token, displayName: result.displayName });
    else res.status(401).json({ error: result.error });
  });
}
