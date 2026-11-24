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

export const SAVINGS_PARSER_VERSION = 'warehouse-savings/1';

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
// "$12⁹⁹" comes out as "$1299", "$12 99", "$12.99" or "$12" with "99" as its own line.
const PRICE = /^[$S]\s*(\d{1,3}(?:,\d{3})*|\d+)(?:[.,\s]\s*(\d{2}))?$/;

/** Parses one or more pages of the Warehouse Savings list, in any order. Pages may overlap. */
export function parseWarehouseSavings(pages: OcrElement[][]): ParsedSavings {
  let viewedOn: string | null = null;
  const byItem = new Map<string, Draft>();
  for (const shot of pages) {
    for (const el of shot) {
      const m = VIEWED.exec(el.text);
      const date = m ? isoDate(m[1], m[2], m[3]) : null;
      if (date && (!viewedOn || date > viewedOn)) viewedOn = date;
    }
    for (const offer of readShot(shot)) {
      const known = byItem.get(offer.itemNumber);
      byItem.set(offer.itemNumber, known ? combine(known, offer) : offer);
    }
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

function readShot(shot: OcrElement[]): Draft[] {
  const lines: Line[] = shot
    .filter((e): e is Required<OcrElement> => e.frame !== undefined)
    .map((e) => ({ text: e.text.trim(), ...e.frame }))
    .filter((l) => l.text !== '')
    .sort((a, b) => a.top - b.top || a.left - b.left);

  const anchors = lines.filter((l) => ITEM.test(l.text));
  if (anchors.length === 0) return [];

  // Text inside the product photos (left of the text column) is ignored.
  const columnLeft = Math.min(...anchors.map((a) => a.left));
  const slack = Math.max(...anchors.map((a) => a.bottom - a.top));
  const column = lines.filter((l) => l.left >= columnLeft - slack);

  return anchors.map((anchor, i) => {
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

function fields(lines: Line[], column: Line[]): Omit<Draft, 'itemNumber' | 'name'> {
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
  if (digits.length >= 3) return Number(digits);
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
