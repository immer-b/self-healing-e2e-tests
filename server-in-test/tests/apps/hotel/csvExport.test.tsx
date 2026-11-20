// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { toCsv } from '../../../src/apps/hotel/csv';
import { signInAs } from './harness';

describe('toCsv', () => {
  it('quotes cells with commas, quotes and newlines', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line\nbreak', 3]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",3');
  });

  it('neutralises spreadsheet formulas so an exported note cannot run in Excel', () => {
    expect(toCsv(['note'], [['=HYPERLINK("http://evil")'], ['+1'], ['-2'], ['@cmd'], ['ok']])).toBe(
      'note\r\n"\'=HYPERLINK(""http://evil"")"\r\n\'+1\r\n\'-2\r\n\'@cmd\r\nok',
    );
  });

  it('writes empty cells for null and undefined', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\r\n,');
  });
});

/** Captures what the page hands to the browser for download. */
function captureDownloads() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob as Blob);
    return 'blob:download';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
  return { blobs, names };
}

afterEach(() => vi.restoreAllMocks());

describe('CSV exports', () => {
  it('exports every change-log entry matching the filters, not just the loaded page', async () => {
    const downloads = captureDownloads();
    const { user } = await signInAs('admin', '/audit');
    await waitFor(() => expect(screen.getAllByRole('row').length).toBe(51));
    await user.click(screen.getByRole('button', { name: /export csv/i }));
    await waitFor(() => expect(downloads.blobs).toHaveLength(1));
    const lines = (await downloads.blobs[0].text()).split('\r\n');
    expect(lines[0]).toBe('When,Who,Action,Record type,Record ID,Record,Changes');
    expect(lines.length - 1).toBeGreaterThan(50);
    expect(downloads.names[0]).toBe('change-log-2026-11-20.csv');
  });

  it('exports a pet’s notes for legal requests', async () => {
    const downloads = captureDownloads();
    const { user } = await signInAs('receiving', '/pets/pet-1');
    const notes = await screen.findByRole('region', { name: /notes/i });
    await within(notes).findByText(/settled in well/i);
    await user.click(within(notes).getByRole('button', { name: /export csv/i }));
    await waitFor(() => expect(downloads.blobs).toHaveLength(1));
    const text = await downloads.blobs[0].text();
    expect(text.split('\r\n')[0]).toBe('Written at,Author,Note,Care round');
    expect(text).toContain('Jordan Lee,Settled in well. Ate all of his dinner.');
    expect(downloads.names[0]).toBe('notes-biscuit-pet-1.csv');
  });
});
