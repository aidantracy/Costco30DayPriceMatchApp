import { parseAmountCents } from './amounts';
import type { Check, ParsedReceipt, ReceiptId, ReceiptItem } from './types';

export const PARSER_VERSION = 'warehouse-receipt/2';

// Item: optional one-letter code, item number, description, price, optional tax flag.
const ITEM = /^(?:[A-Z]\s+)?(\d{3,7})\s+(.+?)\s+(\d{1,6}\.\d{2})(?:\s+[A-Z])?$/;
// Discount: its own number, "/ <item number>", amount with trailing minus.
const DISCOUNT = /^(\d{3,7})\s*\/\s*(\d{3,7})\s+(\d{1,6}\.\d{2}-)$/;
// Multi-unit line printed above its item: "2 @ 17.99".
const QUANTITY = /^(\d{1,3})\s*@\s*\$?(\d{1,6}\.\d{2})$/;
const SUBTOTAL = /^SUBTOTAL\s+(\d{1,6}\.\d{2})$/;
const TAX = /^TAX\s+(\d{1,6}\.\d{2})$/;
const TOTAL = /^(?:\*+\s*)?TOTAL\s+(\d{1,6}\.\d{2})$/;
const INSTANT_SAVINGS = /^INSTANT SAVINGS\s+\$?(\d{1,6}\.\d{2})$/;
const ITEMS_SOLD = /^(?:TOTAL NUMBER OF ITEMS SOLD\s*=|Items Sold:?)\s*(\d{1,4})$/i;
// The receipt identifier appears in three places; any one is enough (spike S-1).
const FOOTER = /Whse:\s*(\d{1,4})\s+Trm:\s*(\d{1,3})\s+Trn:\s*(\d{1,4})/i;
const DATE_WITH_IDS =
  /(\d{2})\/(\d{2})\/(\d{4})\s+\d{1,2}:\d{2}\s+(\d{1,4})\s+(\d{1,3})\s+(\d{1,4})(?:\s+\d{1,4})?$/;
const BARCODE = /^21(\d{4})(\d{3})(\d{4})(\d{2})(\d{2})(\d{2})\d{4}$/;
const DATE = /(\d{2})\/(\d{2})\/(\d{4})\s+\d{1,2}:\d{2}/;
// Payment details are recognized only so they can be dropped (NFR-03).
const PAYMENT =
  /^(?:[Xx*]{4,}\d{4}|APPROVED|AMOUNT:|CHIP|VISA|MASTERCARD|AMEX|DISCOVER|CHANGE\b|AID:|SEQ#|APP#)/;
const NOISE =
  /^(?:[A-Z]|Y|N|\(A\).*|TOTAL TAX.*|Thank You!?|Please Come Again|-+|\|+|Whse:.*|\d{1,4}(?:\s+\d{1,4}){2,3})$/i;
// Pieces of a row that text recognition split apart (wrapped descriptions, two-line prices).
const NUMBER_ONLY = /^(?:[A-Z]\s+)?\d{3,7}$/;
const PRICE_ONLY = /^\d{1,6}\.\d{2}(?:\s+[A-Z])?$/;
const DESCRIPTION_AND_PRICE = /^[A-Z][^/]*?\s+\d{1,6}\.\d{2}(?:\s+[A-Z])?$/;
const NUMBER_AND_DESCRIPTION = /^(?:[A-Z]\s+)?\d{3,7}\s+[^/]*[^\d.\s][^/]*$/;
const CONTINUATION = /^[A-Z0-9][A-Z0-9 &'\-]{0,30}?(?:\s+[YN])?$/;
const TOTALS_WORD = /SUBTOTAL|TOTAL|TAX|SAVINGS|ITEMS/i;

/** Parses the rows of a Costco warehouse receipt (layout recorded in spike S-1). */
export function parseWarehouseReceipt(input: string[]): ParsedReceipt {
  const rows = repairRows(input);
  const items: ReceiptItem[] = [];
  const discounts: { target: string; cents: number; after: number }[] = [];
  const unparsed: string[] = [];
  let subtotal: number | null = null;
  let tax: number | null = null;
  let total: number | null = null;
  let savings: number | null = null;
  let itemsSold: number | null = null;
  let id: Omit<ReceiptId, 'date'> | null = null;
  let idDate: string | null = null;
  let date: string | null = null;
  let pending: { quantity: number; unitCents: number } | null = null;
  // Only rows between the first receipt line and the subtotal can be missed items; text
  // above (the phone's status bar, the app's header, the store address) is ignored.
  let started = false;
  let ended = false;
  let previousWasItem = false;

  for (const row of rows) {
    let m: RegExpExecArray | null;
    const wasItem = previousWasItem;
    previousWasItem = false;
    if (PAYMENT.test(row)) continue;
    if ((m = BARCODE.exec(row))) {
      started = true;
      id ??= ids(m[1], m[2], m[3]);
      idDate ??= `20${m[4]}-${m[5]}-${m[6]}`;
      continue;
    }
    if ((m = FOOTER.exec(row))) {
      id = ids(m[1], m[2], m[3]);
      continue;
    }
    if ((m = DATE_WITH_IDS.exec(row))) {
      date ??= `${m[3]}-${m[1]}-${m[2]}`;
      id ??= ids(m[4], m[5], m[6]);
      continue;
    }
    if (!date && (m = DATE.exec(row))) {
      date = `${m[3]}-${m[1]}-${m[2]}`;
      continue;
    }
    if ((m = SUBTOTAL.exec(row))) {
      subtotal = parseAmountCents(m[1]);
      ended = true;
      continue;
    }
    if ((m = TAX.exec(row))) {
      tax = parseAmountCents(m[1]);
      continue;
    }
    if ((m = TOTAL.exec(row))) {
      total = parseAmountCents(m[1]);
      ended = true;
      continue;
    }
    if ((m = INSTANT_SAVINGS.exec(row))) {
      savings = parseAmountCents(m[1]);
      continue;
    }
    if ((m = ITEMS_SOLD.exec(row))) {
      itemsSold = Number(m[1]);
      continue;
    }
    if ((m = QUANTITY.exec(row))) {
      started = true;
      pending = { quantity: Number(m[1]), unitCents: parseAmountCents(m[2])! };
      continue;
    }
    if ((m = DISCOUNT.exec(row))) {
      discounts.push({
        target: m[2],
        cents: -(parseAmountCents(m[3]) ?? 0),
        after: items.length - 1,
      });
      continue;
    }
    if (!ended && (m = ITEM.exec(row))) {
      started = true;
      const price = parseAmountCents(m[3])!;
      const multi = pending && pending.quantity * pending.unitCents === price ? pending : null;
      items.push({
        itemNumber: m[1],
        description: m[2],
        linePriceCents: price,
        discountCents: 0,
        pricePaidCents: price,
        quantity: multi ? multi.quantity : 1,
        lineNo: items.length + 1,
      });
      pending = null;
      previousWasItem = true;
      continue;
    }
    if (wasItem && CONTINUATION.test(row) && !TOTALS_WORD.test(row) && !NOISE.test(row)) {
      // Second line of a wrapped description, e.g. "LGNG2PK Y".
      const last = items[items.length - 1];
      last.description = `${last.description} ${row.replace(/\s+[YN]$/, '')}`;
      continue;
    }
    if (NOISE.test(row) || /^\d{20,}$/.test(row) || /^[A-Z ]+#\d+$/.test(row)) continue;
    if (started && !ended) unparsed.push(row);
  }

  for (const d of discounts) {
    // Usually the discount names its item; some name a related number, so fall back to the
    // item printed just above the discount line.
    const target =
      items.find((i) => i.itemNumber === d.target && i.pricePaidCents >= d.cents) ??
      (d.after >= 0 && items[d.after].pricePaidCents >= d.cents ? items[d.after] : undefined);
    if (target) {
      target.discountCents += d.cents;
      target.pricePaidCents -= d.cents;
    } else {
      unparsed.push(`discount for ${d.target} not matched to an item`);
    }
  }

  const discountSum = discounts.reduce((s, d) => s + d.cents, 0);
  const lineSum = items.reduce((s, i) => s + i.linePriceCents, 0) - discountSum;
  const units = items.reduce((s, i) => s + i.quantity, 0);
  const checks: Check[] = [
    check('itemCount', itemsSold, units),
    check('subtotal', subtotal, lineSum),
    check('instantSavings', savings ?? (discounts.length ? null : 0), discountSum),
  ];
  const day = date ?? idDate;
  const receiptId: ReceiptId | null = id && day ? { ...id, date: day } : null;

  return {
    parserVersion: PARSER_VERSION,
    receiptId,
    items,
    subtotalCents: subtotal,
    taxCents: tax,
    totalCents: total,
    instantSavingsCents: savings,
    itemsSold,
    checks,
    balanced: receiptId !== null && checks.every((c) => c.passed),
    unparsedRows: unparsed,
  };
}

/** Same receipt, same identifier, whichever place it was read from ("0999" and "999"). */
function ids(warehouse: string, terminal: string, transaction: string) {
  return {
    warehouse: String(Number(warehouse)),
    terminal: String(Number(terminal)),
    transaction: String(Number(transaction)),
  };
}

/**
 * Rejoins the pieces of one printed row that ended up as separate rows: an item number
 * printed between the two lines of a wrapped description, or a price printed above its
 * tax flag.
 */
export function repairRows(rows: string[]): string[] {
  const out = [...rows];
  for (let i = 0; i < out.length; i++) {
    const row = out[i];
    if (NUMBER_ONLY.test(row)) {
      const j = [i - 1, i + 1].find(
        (k) =>
          k >= 0 &&
          k < out.length &&
          DESCRIPTION_AND_PRICE.test(out[k]) &&
          !TOTALS_WORD.test(out[k]),
      );
      if (j !== undefined) {
        out.splice(Math.min(i, j), 2, `${row} ${out[j]}`);
        i = Math.min(i, j);
      }
    } else if (PRICE_ONLY.test(row)) {
      const j = [i + 1, i - 1].find(
        (k) =>
          k >= 0 && k < out.length && NUMBER_AND_DESCRIPTION.test(out[k]) && !ITEM.test(out[k]),
      );
      if (j !== undefined) {
        out.splice(Math.min(i, j), 2, `${out[j].replace(/\s+[YN]$/, '')} ${row}`);
        i = Math.min(i, j);
      }
    }
  }
  return out;
}

function check(name: Check['name'], expected: number | null, actual: number): Check {
  return {
    name,
    expected,
    actual,
    passed: expected !== null && expected === actual,
  };
}
