/**
 * Reads the Costco app's Warehouse Savings list (Warehouse → Warehouse Savings) from the
 * text on screen, with each piece's position: read from the app's screen through the
 * accessibility service (modules/costco-savings), one page per scroll position. Each offer is a product photo on the left and, on the right:
 *
 *   PRODUCT NAME IN CAPITALS (one or two lines)
 *   Item 1234567
 *   $12⁹⁹                      ← the price after the savings, cents in superscript
 *   After $4 OFF
 *   Valid Through Nov 30, 2026
 *   In Stock
 *   Sizes and colors may vary  ← optional notes
 *   Limit 10 per member        ← optional
 *
 * The header says which warehouse the list is for; that's never read or kept (NFR-03).
 */
import type { OcrElement } from './types';

export const SAVINGS_PARSER_VERSION = 'warehouse-savings/2';

export interface SavingsOffer {
  itemNumber: string;
  name: string;
  /** What the item costs during the offer, after the savings, in cents. */
  priceCents: number;
  /** The savings amount, in cents, when it could be read. */
  discountCents: number | null;
  /** Last day of the offer, `YYYY-MM-DD`. */
  validThrough: string;
  /** Offer quantity limit per member, when shown. */
  limit: number | null;
}

export interface ParsedSavings {
  parserVersion: string;
  /** The "Viewed on" date of the list, `YYYY-MM-DD`, when it was on screen. */
  viewedOn: string | null;
  offers: SavingsOffer[];
  /** Offers cut off at the screen edge or misread: name or item number, for the owner. */
  incomplete: string[];
}

interface Draft {
  itemNumber: string;
  name: string;
  priceCents: number | null;
  discountCents: number | null;
  validThrough: string | null;
  limit: number | null;
}

interface Line {
  text: string;
  left: number;
  top: number;
  bottom: number;
  right: number;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const ITEM = /^item\s*#?\s*(\d{3,9})$/i;
const AFTER = /after\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s*off/i;
const VALID = /valid\s*through\s+([a-z]{3})[a-z]*\.?\s*(\d{1,2}),?\s*(\d{4})/i;
const VIEWED = /viewed\s*on\s+([a-z]{3})[a-z]*\.?\s*(\d{1,2}),?\s*(\d{4})/i;
const LIMIT = /limit\s*(\d{1,3})\s*per\s*member/i;
// "$12⁹⁹" comes out as "$1299", "$12 99", "$12.99" or "$12" with "99" as its own line, and
// "$1,299⁹⁹" as "$1,29999", "$1,299 99", "$1,299.99" or "$1,299" with "99" on its own.
const PRICE = /^[$S]\s*(\d{1,3}(?:,\d{3})+|\d+)(?:[.,\s]?\s*(\d{2}))?$/;

/**
 * Parses pages of the Warehouse Savings list in scroll order. Pages may overlap. When an offer
 * is split by a page break (its item number at the bottom of one page and its price and dates
 * at the top of the next, or its name at the bottom of one page and its item number at the
 * top of the next), the two halves are joined.
 */
export function parseWarehouseSavings(pages: OcrElement[][]): ParsedSavings {
  let viewedOn: string | null = null;
  const byItem = new Map<string, Draft>();
  let previous: Page | null = null;
  for (const shot of pages) {
    for (const el of shot) {
      const m = VIEWED.exec(el.text);
      const date = m ? isoDate(m[1], m[2], m[3]) : null;
      if (date && (!viewedOn || date > viewedOn)) viewedOn = date;
    }
    const page = readShot(shot);
    if (page.offers.length === 0) continue;
    const first = page.offers[0];
    const last = previous?.offers[previous.offers.length - 1];
    if (previous && last && last.itemNumber !== first.itemNumber) {
      // The top of this page finishes the last offer of the previous page...
      const known = byItem.get(last.itemNumber);
      if (known) byItem.set(last.itemNumber, combine(known, { ...page.head, ...ids(last) }));
      // ...and the bottom of the previous page has the name of this page's first offer.
      // A page that repeats the whole name already starts with it.
      const tail = previous.tailName;
      if (tail && !first.name.startsWith(tail)) first.name = `${tail} ${first.name}`.trim();
    }
    for (const offer of page.offers) {
      const known = byItem.get(offer.itemNumber);
      byItem.set(offer.itemNumber, known ? combine(known, offer) : offer);
    }
    previous = page;
  }

  const offers: SavingsOffer[] = [];
  const incomplete: string[] = [];
  for (const p of byItem.values()) {
    if (p.priceCents !== null && p.priceCents > 0 && p.validThrough !== null) {
      offers.push({ ...p, priceCents: p.priceCents, validThrough: p.validThrough });
    } else {
      incomplete.push(p.name ? `${p.name} (#${p.itemNumber})` : `#${p.itemNumber}`);
    }
  }
  return { parserVersion: SAVINGS_PARSER_VERSION, viewedOn, offers, incomplete };
}

interface Page {
  offers: Draft[];
  /** Fields above the first item number: the end of an offer from the previous page. */
  head: Fields;
  /** Capitalized lines at the very bottom: the name of an offer continued on the next page. */
  tailName: string;
}

type Fields = Omit<Draft, 'itemNumber' | 'name'>;

function ids(d: Draft): Pick<Draft, 'itemNumber' | 'name'> {
  return { itemNumber: d.itemNumber, name: d.name };
}

function readShot(shot: OcrElement[]): Page {
  const lines: Line[] = shot
    .filter((e): e is Required<OcrElement> => e.frame !== undefined)
    .map((e) => ({ text: e.text.trim(), ...e.frame }))
    .filter((l) => l.text !== '')
    .sort((a, b) => a.top - b.top || a.left - b.left);

  const anchors = lines.filter((l) => ITEM.test(l.text));
  const none = { priceCents: null, discountCents: null, validThrough: null, limit: null };
  if (anchors.length === 0) return { offers: [], head: none, tailName: '' };

  // Text inside the product photos (left of the text column) is ignored.
  const columnLeft = Math.min(...anchors.map((a) => a.left));
  const slack = Math.max(...anchors.map((a) => a.bottom - a.top));
  const column = lines.filter((l) => l.left >= columnLeft - slack);

  const offers = anchors.map((anchor, i) => {
    const next = anchors[i + 1];
    const after = column.filter(
      (l) => l.top > anchor.top && (next === undefined || l.top < next.top) && l !== anchor,
    );
    return {
      itemNumber: ITEM.exec(anchor.text)![1],
      name: nameAbove(column, anchor),
      ...fields(after, column),
    };
  });

  const lastAnchor = anchors[anchors.length - 1];
  const below = column.filter((l) => l.top > lastAnchor.top);
  const tail: string[] = [];
  for (const l of [...below].reverse()) {
    if (!isCapitalized(l.text) || isField(l.text)) break;
    tail.unshift(l.text);
  }
  return {
    offers,
    head: fields(
      column.filter((l) => l.top < anchors[0].top),
      column,
    ),
    tailName: tail.slice(-3).join(' '),
  };
}

/** The capitalized lines right above an item number; notes and headers are mixed case. */
function nameAbove(column: Line[], anchor: Line): string {
  const above = column.filter((l) => l.bottom <= anchor.top + 2).reverse();
  const parts: string[] = [];
  for (const l of above) {
    if (!isCapitalized(l.text) || isField(l.text)) break;
    parts.unshift(l.text);
    if (parts.length === 3) break;
  }
  return parts.join(' ');
}

function isCapitalized(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2) return false;
  return letters.replace(/[^A-Z]/g, '').length / letters.length >= 0.8;
}

function isField(text: string): boolean {
  return [ITEM, AFTER, VALID, LIMIT, PRICE].some((re) => re.test(text));
}

function fields(lines: Line[], column: Line[]): Fields {
  let priceCents: number | null = null;
  let discountCents: number | null = null;
  let validThrough: string | null = null;
  let limit: number | null = null;
  for (const l of lines) {
    const after = AFTER.exec(l.text);
    const valid = VALID.exec(l.text);
    const lim = LIMIT.exec(l.text);
    if (after && discountCents === null) discountCents = dollarsToCents(after[1]);
    else if (valid && validThrough === null) validThrough = isoDate(valid[1], valid[2], valid[3]);
    else if (lim && limit === null) limit = Number(lim[1]);
    else if (priceCents === null && PRICE.test(l.text)) priceCents = price(l, column);
  }
  return { priceCents, discountCents, validThrough, limit };
}

/** The big price, joining superscript cents that were recognized as a separate line. */
function price(line: Line, column: Line[]): number | null {
  const [, whole, cents] = PRICE.exec(line.text)!;
  const digits = whole.replace(/,/g, '');
  if (cents !== undefined) return Number(digits) * 100 + Number(cents);
  const height = line.bottom - line.top;
  const sup = column.find(
    (l) =>
      /^\d{2}$/.test(l.text) &&
      l.left >= line.right - height / 2 &&
      l.left <= line.right + height * 2 &&
      Math.abs(l.top - line.top) <= height,
  );
  if (sup) return Number(digits) * 100 + Number(sup.text);
  // Cents are always shown, so run-together digits end with them ("$1299" is $12.99).
  // Except after a thousands comma: "$1,299" alone has lost its cents, so it's unreadable.
  if (!whole.includes(',') && digits.length >= 3) return Number(digits);
  return null;
}

function dollarsToCents(text: string): number {
  const [whole, fraction = ''] = text.replace(/,/g, '').split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function isoDate(month: string, day: string, year: string): string | null {
  const m = MONTHS.indexOf(month.toLowerCase());
  const d = Number(day);
  if (m < 0 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(Number(year), m, d));
  if (date.getUTCDate() !== d) return null;
  return `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function combine(a: Draft, b: Draft): Draft {
  return {
    itemNumber: a.itemNumber,
    name: b.name.length > a.name.length ? b.name : a.name,
    priceCents: a.priceCents ?? b.priceCents,
    discountCents: a.discountCents ?? b.discountCents,
    validThrough: a.validThrough ?? b.validThrough,
    limit: a.limit ?? b.limit,
  };
}
