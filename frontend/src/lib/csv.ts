/**
 * Lightweight CSV exporter — no external dependency.
 * Used by appointment list / reports for "Export" buttons.
 *
 * Notes:
 * - Values are wrapped in double quotes; embedded quotes are doubled (per RFC 4180).
 * - Formula-looking text is neutralized (CSV injection).
 * - A BOM is prepended so Excel opens the file with the correct UTF-8 encoding
 *   for Vietnamese diacritics.
 */

/**
 * CSV injection guard (A6-15): a cell starting with = + - @ (or a tab / CR)
 * is run as a formula by Excel/Sheets. Names and reasons come from the public
 * booking form, so text cells get a leading apostrophe. Plain numbers
 * (including negatives such as refunds) stay numbers.
 */
export function neutralizeFormula(str: string): string {
  if (/^[=+\-@\t\r]/.test(str) && !/^-?\d+(\.\d+)?$/.test(str)) return `'${str}`;
  return str;
}

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = neutralizeFormula(String(value));
  // Escape double quotes by doubling them; surround the whole cell in quotes
  // (keeps commas and line breaks inside the cell).
  return `"${str.replace(/"/g, '""')}"`;
}

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => unknown;
}

export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escapeCell(c.header)).join(',');
  const bodyLines = rows.map((row) =>
    columns.map((c) => escapeCell(c.accessor(row))).join(','),
  );
  return [headerLine, ...bodyLines].join('\r\n');
}

/**
 * Trigger a browser download for the given CSV text.
 * Prepends a UTF-8 BOM so Excel renders Vietnamese characters correctly.
 */
export function downloadCsv(filename: string, csv: string): void {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Free the blob URL on the next tick so the browser can finish the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Convenience wrapper: build CSV from rows + columns and trigger download.
 */
export function exportCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  downloadCsv(filename, rowsToCsv(rows, columns));
}
