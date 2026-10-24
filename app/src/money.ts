/**
 * Formats an amount stored as integer cents (see docs/design/data-model.md)
 * as US dollars, for display only.
 */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError('cents must be an integer');
  }
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}
