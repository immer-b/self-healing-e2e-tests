import type { DataRecord, RecordFilter, RecordInput, UiVersion } from '../../server/types';
import type { Report } from '../../server/report';

export type { DataRecord, RecordFilter, RecordInput, Report };

interface ApiError extends Error {
  status: number;
  body: unknown;
}

function apiError(message: string, status: number, body: unknown): ApiError {
  return Object.assign(new Error(message), { status, body });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = (body as { error?: string } | undefined)?.error ?? `Request failed (${response.status})`;
    throw apiError(message, response.status, body);
  }
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; displayName: string }>('/api/login', json('POST', { username, password })),
  listRecords: ({ text = '', status = '' }: RecordFilter = {}) =>
    request<DataRecord[]>(`/api/records?${new URLSearchParams({ text, status })}`),
  createRecord: (input: RecordInput) => request<DataRecord>('/api/records', json('POST', input)),
  updateRecord: (id: string, patch: Partial<RecordInput>) =>
    request<DataRecord>(`/api/records/${id}`, json('PUT', patch)),
  deleteRecord: (id: string) => request<void>(`/api/records/${id}`, { method: 'DELETE' }),
  getReport: () => request<Report>('/api/report'),
  getUiVersion: () => request<{ version: UiVersion }>('/api/ui-version'),
  setUiVersion: (version: UiVersion) => request<{ version: UiVersion }>('/api/ui-version', json('PUT', { version })),
};
