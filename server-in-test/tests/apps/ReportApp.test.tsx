// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportApp } from '../../src/apps/report/ReportApp';
import { buildReport } from '../../src/server/report';
import type { DataRecord } from '../../src/server/types';
import { mockFetch } from './testUtils';

const records: DataRecord[] = [
  { id: '1', name: 'A', owner: 'alice', status: 'active', amount: 1200 },
  { id: '2', name: 'B', owner: 'bob', status: 'inactive', amount: 800 },
  { id: '3', name: 'C', owner: 'alice', status: 'pending', amount: 450 },
];

let current = records;
beforeEach(() => {
  current = records;
  mockFetch({ 'GET /api/report': () => ({ body: buildReport(current) }) });
});
afterEach(() => vi.unstubAllGlobals());

/** Finds a metric's displayed value by its (version-specific) label. */
function metricValue(label: RegExp): string {
  const group = screen.queryAllByRole('group', { name: label })[0];
  if (group) return group.textContent ?? '';
  const labelEl = screen.getAllByText(label)[0];
  if (labelEl.tagName === 'DT') return labelEl.nextElementSibling?.textContent ?? '';
  return labelEl.parentElement?.textContent ?? '';
}

const METRICS = {
  totalRecords: /^(total records|records)$/i,
  totalAmount: /^(total amount|amount total)$/i,
  averageAmount: /^(average amount|amount average)$/i,
  active: /^active$/i,
  pending: /^pending$/i,
};

describe.each([1, 2, 3] as const)('ReportApp v%i', (version) => {
  beforeEach(async () => {
    render(<ReportApp version={version} />);
    await screen.findAllByText(/alice/);
  });

  it('shows summary metrics', () => {
    expect(metricValue(METRICS.totalRecords)).toContain('3');
    expect(metricValue(METRICS.totalAmount)).toContain('$2,450');
    expect(metricValue(METRICS.averageAmount)).toContain('$817');
    expect(metricValue(METRICS.active)).toContain('1');
    expect(metricValue(METRICS.pending)).toContain('1');
  });

  it('lists the owner breakdown with counts and amounts', () => {
    const alice = screen.getByText('alice').closest('tr, li') as HTMLElement;
    expect(alice).toHaveTextContent('2');
    expect(alice).toHaveTextContent('$1,650');
  });

  it('refreshes the report on demand', async () => {
    current = [...records, { id: '4', name: 'D', owner: 'dave', status: 'active', amount: 50 }];
    await userEvent.click(screen.getByRole('button', { name: /refresh|reload/i }));
    expect(await screen.findByText('dave')).toBeInTheDocument();
    expect(metricValue(METRICS.totalRecords)).toContain('4');
  });

  it('exports the report as a CSV download', async () => {
    const createObjectURL = vi.fn(() => 'blob:report');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await userEvent.click(screen.getByRole('button', { name: /csv/i }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('report.csv');
    click.mockRestore();
  });
});
