type Cell = string | number | boolean | null | undefined;

/** Cells starting with these characters are formulas in spreadsheet apps (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

const cell = (value: Cell) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** RFC 4180 CSV (CRLF line endings), safe to open in a spreadsheet. */
export const toCsv = (header: string[], rows: Cell[][]) => [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');

/** Hands a CSV file to the browser as a download. */
export function downloadCsv(fileName: string, csv: string) {
  // The BOM makes Excel read the file as UTF-8 (names with accents, the • mask, arrows).
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
