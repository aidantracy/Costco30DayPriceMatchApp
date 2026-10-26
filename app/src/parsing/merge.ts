import { normalizeSpaces } from './rows';

/**
 * Joins the rows of several screenshots of one receipt, taken while scrolling.
 * Where the end of one screenshot repeats at the start of the next, the repeated
 * rows are kept once. Only overlaps of at least `minOverlap` rows are removed, so
 * two genuinely identical purchase lines in a row are not merged by accident.
 */
export function mergeScreenshots(shots: string[][], minOverlap = 2): string[] {
  const merged: string[] = [];
  for (const shot of shots) {
    const rows = shot.map(normalizeSpaces).filter(Boolean);
    const overlap = longestOverlap(merged, rows, minOverlap);
    merged.push(...rows.slice(overlap));
  }
  return merged;
}

function longestOverlap(previous: string[], next: string[], minOverlap: number): number {
  const max = Math.min(previous.length, next.length);
  for (let k = max; k >= minOverlap; k--) {
    let same = true;
    for (let i = 0; i < k; i++) {
      if (previous[previous.length - k + i] !== next[i]) {
        same = false;
        break;
      }
    }
    if (same) return k;
  }
  return 0;
}
