import type { FormEvent } from 'react';
import type { LoginState } from '../useLogin';

export interface LoginLayoutProps {
  state: LoginState;
  resultsHref: string;
  onSubmit: (username: string, password: string) => void;
}

/** Extracts username/password from a native form submit event. */
export function readCredentials(event: FormEvent<HTMLFormElement>, userField: string, passField: string) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  return [String(data.get(userField) ?? ''), String(data.get(passField) ?? '')] as const;
}
