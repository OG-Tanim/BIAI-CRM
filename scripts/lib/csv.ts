/**
 * A small RFC 4180 reader for the one CSV this repository owns.
 *
 * The sample file contains commas inside quoted fields — most prominently
 * `"Mahmud Hasan (Managing Director, Gazipur textile company)"` — so a
 * `split(',')` would silently shift every field after it. Quotes, escaped
 * double quotes, blank lines and CRLF are handled here; no dependency is
 * needed for a file this small.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (character === '\r') {
      continue;
    }

    if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += character;
  }

  if (inQuotes) {
    throw new Error('CSV ended inside a quoted field.');
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((value) => value.trim() !== ''));
}
