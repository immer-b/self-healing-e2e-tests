import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, type Employee } from './api';

interface AuthState {
  /** undefined while the session is being checked, null when signed out. */
  employee: Employee | null | undefined;
  today: string;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>();
  const [today, setToday] = useState(localToday);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setEmployee(me.employee);
      setToday(me.today);
    } catch {
      setEmployee(null);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setEmployee(null));
    refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      await api.login(username, password);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    // Don't leave the last person's rounds and notes in the offline cache on a shared device.
    if (typeof caches !== 'undefined') await caches.delete('willow-api-v1').catch(() => false);
    setEmployee(null);
  }, []);

  const value = useMemo(() => ({ employee, today, signIn, signOut, refresh }), [employee, today, signIn, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** The signed-in employee. Only call from pages rendered behind sign-in. */
export function useEmployee() {
  const { employee, today } = useAuth();
  if (!employee) throw new Error('No signed-in employee');
  return { employee, today };
}
