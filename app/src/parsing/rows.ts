import type { OcrElement } from './types';

/**
 * Rebuilds receipt rows from recognized text. Text engines often split one printed
 * row into separate pieces per column (item number, description, price), so pieces
 * whose vertical centers fall within half a line height of each other are joined,
 * left to right. Pieces without a box are kept as their own rows, in order.
 */
export function assembleRows(elements: OcrElement[]): string[] {
  const boxed = elements.filter((e) => e.frame && e.text.trim());
  const unboxed = elements.filter((e) => !e.frame && e.text.trim());
  if (boxed.length === 0) {
    return unboxed.map((e) => normalizeSpaces(e.text));
  }

  const heights = boxed.map((e) => e.frame!.bottom - e.frame!.top).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 1;
  const tolerance = medianHeight / 2;

  const sorted = [...boxed].sort((a, b) => center(a) - center(b));
  const rows: OcrElement[][] = [];
  for (const el of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(center(el) - rowCenter(row)) <= tolerance) {
      row.push(el);
    } else {
      rows.push([el]);
    }
  }
  return rows.map((row) =>
    normalizeSpaces(
      row
        .sort((a, b) => a.frame!.left - b.frame!.left)
        .map((e) => e.text)
        .join(' '),
    ),
  );
}

function center(e: OcrElement): number {
  return (e.frame!.top + e.frame!.bottom) / 2;
}

function rowCenter(row: OcrElement[]): number {
  return row.reduce((sum, e) => sum + center(e), 0) / row.length;
}

export function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
