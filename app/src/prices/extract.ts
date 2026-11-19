/**
 * Reads a costco.com product page's text (spike S-2). Runs on the phone; only the values
 * returned here are sent to the server, never the page itself (NFR-04).
 */

export type PageResult =
  | {
      kind: 'found';
      itemNumber: string;
      warehousePriceCents: number | null;
      onlinePriceCents: number | null;
      /** Last day of the current instant savings, ISO date. */
      promoEnd: string | null;
    }
  | { kind: 'notFound' }
  /** costco.com is asking whether this is a robot, or refusing requests. */
  | { kind: 'challenge' }
  /** No home warehouse chosen in the in-app browser, so there's no warehouse price. */
  | { kind: 'needWarehouse' }
  /** The page didn't finish loading or its layout changed. */
  | { kind: 'unreadable' };

const CHALLENGE =
  /Access Denied|Request unsuccessful|Pardon Our Interruption|Too Many Requests|verify you are (a )?human/i;
const NOT_FOUND = /not able to find a match/i;
const ITEM = /\bItem\s*#?\s*(\d{3,9})\b/;
const MONEY = String.raw`\$\s*(\d{1,3}(?:,\d{3})+|\d+)\s*\.\s*(\d{2})`;
const WAREHOUSE_PRICE = new RegExp(String.raw`Warehouse Price\s*` + MONEY, 'i');
const ONLINE_PRICE = new RegExp(String.raw`Online Price\s*` + MONEY, 'i');
const DATE = String.raw`(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})`;
const SAVINGS_DATES = new RegExp(
  String.raw`valid\s+` + DATE + String.raw`\s+through\s+` + DATE,
  'i',
);
const VALID_THROUGH = new RegExp(String.raw`valid through\s+` + DATE, 'i');
const NO_WAREHOUSE = /Set My Warehouse/i;

export function readProductPage(text: string, requestedItem: string): PageResult {
  const flat = text.replace(/\s+/g, ' ');
  if (CHALLENGE.test(flat)) return { kind: 'challenge' };
  if (NOT_FOUND.test(flat)) return { kind: 'notFound' };
  const item = ITEM.exec(flat);
  if (!item) return { kind: 'unreadable' };
  // A search can land on a related product; only the requested item counts.
  if (item[1] !== requestedItem) return { kind: 'notFound' };

  const warehouse = cents(WAREHOUSE_PRICE.exec(flat));
  if (warehouse === null && NO_WAREHOUSE.test(flat)) return { kind: 'needWarehouse' };
  const online = cents(ONLINE_PRICE.exec(flat));
  if (warehouse === null && online === null) return { kind: 'unreadable' };

  const savings = SAVINGS_DATES.exec(flat);
  const through = savings ? savings.slice(4, 7) : VALID_THROUGH.exec(flat)?.slice(1, 4);
  return {
    kind: 'found',
    itemNumber: item[1],
    warehousePriceCents: warehouse,
    onlinePriceCents: online,
    promoEnd: through ? isoDate(through[0], through[1], through[2]) : null,
  };
}

function cents(m: RegExpExecArray | null): number | null {
  if (!m) return null;
  return Number(m[1].replace(/,/g, '')) * 100 + Number(m[2]);
}

function isoDate(month: string, day: string, year: string): string {
  const y = year.length === 2 ? `20${year}` : year;
  return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
