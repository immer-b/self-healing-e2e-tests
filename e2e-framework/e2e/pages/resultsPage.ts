import type { Locator, Page } from '@playwright/test';
import type { Healer } from '../../src/healing/healer';

export interface RecordValues {
  name: string;
  owner: string;
  status: 'active' | 'inactive' | 'pending';
  amount: number;
}

type RowAction = 'view' | 'edit' | 'delete';
const ROW_ACTION_LABELS: Record<RowAction, string> = { view: 'View', edit: 'Edit', delete: 'Delete' };

const firstNumber = (text: string) => Number(/\d[\d,]*/.exec(text)?.[0].replace(/,/g, '') ?? NaN);

/**
 * Results (query) page object: filtering plus CRUD through each row's "⋯" actions.
 * Selectors target UI v1 (table + dropdown + modals). In v2 (div grid + popover + inline panels) and
 * v3 (cards + drawer) they are healed from the v1 fingerprints.
 */
export function createResultsPage(page: Page, healer: Healer, uiVersion: number) {
  const ui = healer.forPage(page, 'results');

  const elements = {
    search: () => ui.locate({ key: 'search', selector: '#search' }),
    statusFilter: () => ui.locate({ key: 'statusFilter', selector: '#status-filter' }),
    addButton: () => ui.locate({ key: 'addRecord', selector: '#add-record' }),
    resultCount: () => ui.locate({ key: 'resultCount', selector: '#result-count', dynamicText: true }),
    rows: () => ui.locateAll({ key: 'rows', selector: '#results-table tbody tr[data-id]' }),
    rowActions: (row: Locator) => ui.locate({ key: 'row.actions', selector: 'button.row-menu', scope: row }),
    rowAction: (action: RowAction) =>
      ui.locate({ key: `row.menu.${action}`, selector: `.row-menu-list button:text-is("${ROW_ACTION_LABELS[action]}")` }),
    details: () => ui.locate({ key: 'details', selector: '#details-modal', dynamicText: true }),
    form: {
      name: () => ui.locate({ key: 'form.name', selector: '#record-name' }),
      owner: () => ui.locate({ key: 'form.owner', selector: '#record-owner' }),
      status: () => ui.locate({ key: 'form.status', selector: '#record-status' }),
      amount: () => ui.locate({ key: 'form.amount', selector: '#record-amount' }),
      save: () => ui.locate({ key: 'form.save', selector: '#save-record' }),
    },
    confirmDelete: () => ui.locate({ key: 'confirmDelete', selector: '#confirm-delete' }),
  };

  const row = async (name: string) => (await elements.rows()).filter({ hasText: name });

  const chooseRowAction = async (name: string, action: RowAction) => {
    await (await elements.rowActions(await row(name))).click();
    await (await elements.rowAction(action)).click();
  };

  const fillForm = async (values: Partial<RecordValues>) => {
    if (values.name !== undefined) await (await elements.form.name()).fill(values.name);
    if (values.owner !== undefined) await (await elements.form.owner()).fill(values.owner);
    if (values.status !== undefined) await (await elements.form.status()).selectOption(values.status);
    if (values.amount !== undefined) await (await elements.form.amount()).fill(String(values.amount));
    await (await elements.form.save()).click();
  };

  return {
    goto: () => page.goto(`/query/?v=${uiVersion}`),

    search: async (text: string) => (await elements.search()).fill(text),
    filterByStatus: async (status: RecordValues['status'] | '') => (await elements.statusFilter()).selectOption(status),
    resultCount: async () => firstNumber(await (await elements.resultCount()).innerText()),

    rows: elements.rows,
    row,
    rowTexts: async () => (await elements.rows()).allInnerTexts(),

    createRecord: async (values: RecordValues) => {
      await (await elements.addButton()).click();
      await fillForm(values);
    },
    viewDetails: async (name: string) => {
      await chooseRowAction(name, 'view');
      return elements.details();
    },
    editRecord: async (name: string, changes: Partial<RecordValues>) => {
      await chooseRowAction(name, 'edit');
      await fillForm(changes);
    },
    deleteRecord: async (name: string) => {
      await chooseRowAction(name, 'delete');
      await (await elements.confirmDelete()).click();
    },
  };
}

export type ResultsPage = ReturnType<typeof createResultsPage>;
