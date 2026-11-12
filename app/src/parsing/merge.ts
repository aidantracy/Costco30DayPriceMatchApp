import { normalizeSpaces } from './rows';

/** How many rows of phone or app screen text (status bar, header, tab bar) to look past. */
const MAX_CHROME_ROWS = 8;

/**
 * Joins the rows of several screenshots of one receipt, taken while scrolling.
 *
 * Each screenshot repeats the phone's status bar and the app's header at the top and its
 * tab bar at the bottom, so the receipt rows that appear in both screenshots are found by
 * looking past up to {@link MAX_CHROME_ROWS} rows at the end of the earlier screenshot and
 * the start of the next one. The longest shared run of at least `minOverlap` rows is kept
 * once, and the screen text around it is dropped. Requiring a run of rows means two
 * genuinely identical purchase lines are not merged by accident.
 */
export function mergeScreenshots(shots: string[][], minOverlap = 2): string[] {
  let merged: string[] = [];
  for (const shot of shots) {
    const rows = shot.map(normalizeSpaces).filter(Boolean);
    const best = bestOverlap(merged, rows, minOverlap);
    merged = best
      ? [
          ...merged.slice(0, merged.length - best.skipEnd),
          ...rows.slice(best.skipStart + best.length),
        ]
      : [...merged, ...rows];
  }
  return merged;
}

interface Overlap {
  length: number;
  /** Rows dropped from the end of what's merged so far (the earlier screenshot's tab bar). */
  skipEnd: number;
  /** Rows dropped from the start of the next screenshot (its status bar and header). */
  skipStart: number;
}

function bestOverlap(previous: string[], next: string[], minOverlap: number): Overlap | null {
  let best: Overlap | null = null;
  for (let skipEnd = 0; skipEnd <= Math.min(MAX_CHROME_ROWS, previous.length); skipEnd++) {
    const end = previous.length - skipEnd;
    for (let skipStart = 0; skipStart <= Math.min(MAX_CHROME_ROWS, next.length); skipStart++) {
      const max = Math.min(end, next.length - skipStart);
      for (let k = max; k >= minOverlap; k--) {
        if (best && k <= best.length) break;
        if (sameRun(previous, end - k, next, skipStart, k)) {
          best = { length: k, skipEnd, skipStart };
          break;
        }
      }
    }
  }
  return best;
}

function sameRun(a: string[], aStart: number, b: string[], bStart: number, k: number): boolean {
  for (let i = 0; i < k; i++) {
    if (a[aStart + i] !== b[bStart + i]) return false;
  }
  return true;
}
