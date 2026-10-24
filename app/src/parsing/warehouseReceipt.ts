import { parseAmountCents } from './amounts';
import type { Check, ParsedReceipt, ReceiptId, ReceiptItem } from './types';

export const PARSER_VERSION = 'warehouse-receipt/1';

// Item: optional one-letter code, item number, description, price, optional tax flag.
const ITEM = /^(?:[A-Z]\s+)?(\d{3,7})\s+(.+?)\s+(\d{1,6}\.\d{2})(?:\s+[A-Z])?$/;
// Discount: its own number, "/ <item number>", amount with trailing minus.
const DISCOUNT = /^(\d{3,7})\s*\/\s*(\d{3,7})\s+(\d{1,6}\.\d{2}-)$/;
const SUBTOTAL = /^SUBTOTAL\s+(\d{1,6}\.\d{2})$/;
const TAX = /^TAX\s+(\d{1,6}\.\d{2})$/;
const TOTAL = /^(?:\*+\s*)?TOTAL\s+(\d{1,6}\.\d{2})$/;
const INSTANT_SAVINGS = /^INSTANT SAVINGS\s+\$?(\d{1,6}\.\d{2})$/;
const ITEMS_SOLD = /^(?:TOTAL NUMBER OF ITEMS SOLD\s*=|Items Sold:)\s*(\d{1,4})$/i;
const FOOTER = /Whse:\s*(\d{1,4})\s+Trm:\s*(\d{1,3})\s+Trn:\s*(\d{1,4})/i;
const DATE = /(\d{2})\/(\d{2})\/(\d{4})\s+\d{1,2}:\d{2}/;
// Payment details are recognized only so they can be dropped (NFR-03).
const PAYMENT = /^(?:[Xx*]{4,}\d{4}|APPROVED|AMOUNT:|CHIP|VISA|MASTERCARD|AMEX|DISCOVER|CHANGE\b|AID:|SEQ#|APP#)/;
const NOISE = /^(?:[A-Z]|Y|N|\(A\).*|TOTAL TAX.*|Thank You!?|Please Come Again|-+|\|+)$/i;

/** Parses the rows of a Costco warehouse receipt (layout recorded in spike S-1). */
export function parseWarehouseReceipt(rows: string[]): ParsedReceipt {
  const items: ReceiptItem[] = [];
  const discounts: { target: string; cents: number }[] = [];
  const unparsed: string[] = [];
  let subtotal: number | null = null;
  let tax: number | null = null;
  let total: number | null = null;
  let savings: number | null = null;
  let itemsSold: number | null = null;
  let footer: { warehouse: string; terminal: string; transaction: string } | null = null;
  let date: string | null = null;

  for (const row of rows) {
    let m: RegExpExecArray | null;
    if (PAYMENT.test(row)) continue;
    if ((m = FOOTER.exec(row))) {
      footer = { warehouse: m[1], terminal: m[2], transaction: m[3] };
      continue;
    }
    if (!date && (m = DATE.exec(row))) {
      date = `${m[3]}-${m[1]}-${m[2]}`;
      continue;
    }
    if ((m = SUBTOTAL.exec(row))) {
      subtotal = parseAmountCents(m[1]);
      continue;
    }
    if ((m = TAX.exec(row))) {
      tax = parseAmountCents(m[1]);
      continue;
    }
    if ((m = TOTAL.exec(row))) {
      total = parseAmountCents(m[1]);
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
    if ((m = DISCOUNT.exec(row))) {
      discounts.push({ target: m[2], cents: -(parseAmountCents(m[3]) ?? 0) });
      continue;
    }
    if ((m = ITEM.exec(row))) {
      const price = parseAmountCents(m[3])!;
      items.push({
        itemNumber: m[1],
        description: m[2],
        linePriceCents: price,
        discountCents: 0,
        pricePaidCents: price,
        quantity: 1,
        lineNo: items.length + 1,
      });
      continue;
    }
    if (NOISE.test(row) || /^\d{20,}$/.test(row) || /^[A-Z ]+#\d+$/.test(row)) continue;
    unparsed.push(row);
  }

  for (const d of discounts) {
    const target = items.find((i) => i.itemNumber === d.target && i.pricePaidCents >= d.cents);
    if (target) {
      target.discountCents += d.cents;
      target.pricePaidCents -= d.cents;
    } else {
      unparsed.push(`discount for ${d.target} not matched to an item`);
    }
  }

  const discountSum = discounts.reduce((s, d) => s + d.cents, 0);
  const lineSum = items.reduce((s, i) => s + i.linePriceCents, 0) - discountSum;
  const checks: Check[] = [
    check('itemCount', itemsSold, items.length),
    check('subtotal', subtotal, lineSum),
    check('instantSavings', savings ?? (discounts.length ? null : 0), discountSum),
  ];
  const receiptId: ReceiptId | null = footer && date ? { ...footer, date } : null;

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

function check(name: Check['name'], expected: number | null, actual: number): Check {
  return { name, expected, actual, passed: expected !== null && expected === actual };
}
