import { useState } from 'react';
import { api } from '../shared/api';

export interface LoginState {
  error?: string;
  busy: boolean;
  displayName?: string;
}

export function useLogin() {
  const [state, setState] = useState<LoginState>({ busy: false });

  const submit = async (username: string, password: string) => {
    if (!username.trim() || !password) {
      setState({ busy: false, error: 'Username and password are required' });
      return;
    }
    setState({ busy: true });
    try {
      const { displayName } = await api.login(username.trim(), password);
      setState({ busy: false, displayName });
    } catch (error) {
      setState({ busy: false, error: (error as Error).message });
    }
  };

  return { state, submit };
}
