/** Calendar dates are ISO `YYYY-MM-DD` strings, matching the API. No time zones involved. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today in the phone's local time zone, as `YYYY-MM-DD`. */
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** True when `value` is a real calendar date written as `YYYY-MM-DD`. */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** `2026-10-03` → `Oct 3`. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** Days-left text for a purchase's 30-day window. Day 30 counts (BR-1). */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return 'Window closed';
  if (daysLeft === 0) return 'Last day today';
  return daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
}
