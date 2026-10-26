/** Parses a printed amount such as "29.99", "8.00-" or "$23.80" into integer cents. */
export function parseAmountCents(text: string): number | null {
  const m = /^\$?(\d{1,6})\.(\d{2})(-)?$/.exec(text.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number(m[2]);
  return m[3] ? -cents : cents;
}
