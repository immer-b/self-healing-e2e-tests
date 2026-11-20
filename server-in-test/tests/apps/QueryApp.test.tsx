// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryApp } from '../../src/apps/query/QueryApp';
import { createRecordRepository } from '../../src/server/recordRepository';
import type { RecordStatus } from '../../src/server/types';
import { mockFetch } from './testUtils';

const SEED = [
  { name: 'Alpha Project', owner: 'alice', status: 'active' as const, amount: 1200 },
  { name: 'Beta Launch', owner: 'bob', status: 'inactive' as const, amount: 800 },
  { name: 'Gamma Audit', owner: 'alice', status: 'pending' as const, amount: 450 },
];

/** Backs the mocked fetch with the real repository so the UI talks to realistic data. */
function mockRecordsApi() {
  const repo = createRecordRepository(SEED);
  mockFetch({
    'GET /api/records': (_init, url) =>
      ({ body: repo.list({ text: url.searchParams.get('text') ?? '', status: (url.searchParams.get('status') ?? '') as RecordStatus }) }),
    'POST /api/records': (init) => ({ status: 201, body: repo.create(JSON.parse(String(init?.body))) }),
    'PUT /api/records/*': (init, url) => ({ body: repo.update(url.pathname.split('/').pop()!, JSON.parse(String(init?.body))) }),
    'DELETE /api/records/*': (_init, url) => {
      repo.remove(url.pathname.split('/').pop()!);
      return { status: 204 };
    },
  });
  return repo;
}

const ui = {
  search: () => screen.getByRole('searchbox', { name: /search|filter/i }),
  statusFilter: () => screen.getByRole('combobox', { name: /status/i }),
  addButton: () => screen.getByRole('button', { name: /^(add record|\+ new record|add new record)$/i }),
  rowActions: (name: string) => {
    const row = screen.getByText(name).closest('tr, [role="row"], li') as HTMLElement;
    return within(row).getByRole('button', { name: /actions|options/i });
  },
  action: (label: RegExp) => screen.getByRole('button', { name: label }),
  field: (label: RegExp) => screen.getByLabelText(label, { selector: 'input,select' }),
  save: () => screen.getByRole('button', { name: /^save/i }),
  count: () => screen.getByRole('status'),
  details: async () => {
    const find = () =>
      screen.queryAllByRole('dialog', { name: /details/i })[0] ?? screen.queryAllByRole('region', { name: /details/i })[0];
    await waitFor(() => expect(find()).toBeTruthy());
    return find();
  },
};

async function fillForm(values: { name?: string; owner?: string; amount?: string; status?: string }) {
  if (values.name !== undefined) {
    await userEvent.clear(ui.field(/name/i));
    await userEvent.type(ui.field(/name/i), values.name);
  }
  if (values.owner !== undefined) {
    await userEvent.clear(ui.field(/owner/i));
    await userEvent.type(ui.field(/owner/i), values.owner);
  }
  if (values.amount !== undefined) {
    await userEvent.clear(ui.field(/amount/i));
    await userEvent.type(ui.field(/amount/i), values.amount);
  }
  if (values.status !== undefined) await userEvent.selectOptions(ui.field(/^status$|record status/i), values.status);
}

beforeEach(() => mockRecordsApi());
afterEach(() => vi.unstubAllGlobals());

describe.each([1, 2, 3] as const)('QueryApp v%i', (version) => {
  beforeEach(async () => {
    render(<QueryApp version={version} />);
    await screen.findByText('Alpha Project');
  });

  it('renders all records and a result count', () => {
    expect(screen.getByText('Beta Launch')).toBeInTheDocument();
    expect(ui.count()).toHaveTextContent('3');
  });

  it('filters by free text', async () => {
    await userEvent.type(ui.search(), 'beta');
    await waitFor(() => expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument());
    expect(screen.getByText('Beta Launch')).toBeInTheDocument();
  });

  it('filters by status and shows an empty state', async () => {
    await userEvent.selectOptions(ui.statusFilter(), 'pending');
    await waitFor(() => expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument());
    expect(screen.getByText('Gamma Audit')).toBeInTheDocument();
    await userEvent.type(ui.search(), 'zzz');
    expect(await screen.findByText(/no records/i)).toBeInTheDocument();
  });

  it('creates a record', async () => {
    await userEvent.click(ui.addButton());
    await fillForm({ name: 'Omega Pilot', owner: 'olga', amount: '99', status: 'pending' });
    await userEvent.click(ui.save());
    expect(await screen.findByText('Omega Pilot')).toBeInTheDocument();
  });

  it('views record details from the row actions', async () => {
    await userEvent.click(ui.rowActions('Beta Launch'));
    await userEvent.click(ui.action(/^(view|view details)$/i));
    const details = await ui.details();
    expect(details).toHaveTextContent('bob');
    expect(details).toHaveTextContent('inactive');
  });

  it('edits a record from the row actions', async () => {
    await userEvent.click(ui.rowActions('Alpha Project'));
    await userEvent.click(ui.action(/^(edit|edit record)$/i));
    await fillForm({ name: 'Alpha Renamed' });
    await userEvent.click(ui.save());
    expect(await screen.findByText('Alpha Renamed')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument();
  });

  it('deletes a record after confirmation', async () => {
    await userEvent.click(ui.rowActions('Gamma Audit'));
    await userEvent.click(ui.action(/^(delete|delete record)$/i));
    await userEvent.click(ui.action(/^(confirm delete|yes, delete|delete permanently)$/i));
    await waitFor(() => expect(screen.queryByText('Gamma Audit')).not.toBeInTheDocument());
    expect(ui.count()).toHaveTextContent('2');
  });
});
