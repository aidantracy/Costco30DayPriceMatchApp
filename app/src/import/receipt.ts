import type { ReceiptBatchIn } from '../api/types';
import { formatCents } from '../money';
import { mergeScreenshots } from '../parsing/merge';
import { assembleRows } from '../parsing/rows';
import type { Check, OcrElement, ParsedReceipt, ReceiptItem } from '../parsing/types';
import { parseWarehouseReceipt } from '../parsing/warehouseReceipt';

/** Turns the recognized text of one or more screenshots (in scroll order) into a receipt. */
export function readScreenshots(shots: OcrElement[][]): ParsedReceipt {
  return parseWarehouseReceipt(mergeScreenshots(shots.map(assembleRows)));
}

/** Recomputes the three parse checks after the owner corrects or removes lines. */
export function recheck(receipt: ParsedReceipt, items: ReceiptItem[]): Check[] {
  const discounts = items.reduce((s, i) => s + i.discountCents, 0);
  const lines = items.reduce((s, i) => s + i.linePriceCents, 0) - discounts;
  const savingsExpected = receipt.instantSavingsCents ?? (discounts ? null : 0);
  return [
    check('itemCount', receipt.itemsSold, items.length),
    check('subtotal', receipt.subtotalCents, lines),
    check('instantSavings', savingsExpected, discounts),
  ];
}

function check(name: Check['name'], expected: number | null, actual: number): Check {
  return { name, expected, actual, passed: expected !== null && expected === actual };
}

/** Plain-language problems to show on the review screen, most important first. */
export function problems(receipt: ParsedReceipt, checks: Check[]): string[] {
  const out: string[] = [];
  if (!receipt.receiptId) {
    out.push(
      "Couldn't find the receipt number. Include the bottom of the receipt (the line with Whse, Trm and Trn).",
    );
  }
  for (const c of checks) {
    if (c.passed) continue;
    if (c.expected === null) {
      out.push(MISSING[c.name]);
    } else if (c.name === 'itemCount') {
      out.push(`Found ${c.actual} items, but the receipt says ${c.expected}. A line may be missing.`);
    } else if (c.name === 'subtotal') {
      out.push(
        `Items add up to ${formatCents(c.actual)}, but the subtotal is ${formatCents(c.expected)}. Check the prices.`,
      );
    } else {
      out.push(
        `Discounts add up to ${formatCents(c.actual)}, but instant savings are ${formatCents(c.expected)}.`,
      );
    }
  }
  return out;
}

const MISSING: Record<Check['name'], string> = {
  itemCount: "Couldn't find the number of items sold. Include the bottom of the receipt.",
  subtotal: "Couldn't find the subtotal. Include the bottom of the receipt.",
  instantSavings: "Couldn't find the instant savings total, but there are discounts.",
};

/** The import request for the API, or null when the receipt can't be identified. */
export function toBatch(
  receipt: ParsedReceipt,
  items: ReceiptItem[],
  today: string,
): ReceiptBatchIn | null {
  const id = receipt.receiptId;
  if (!id || id.date > today || items.length === 0) return null;
  return {
    source: 'screenshot',
    receipts: [
      {
        channel: 'warehouse',
        purchase_date: id.date,
        warehouse_number: String(Number(id.warehouse)),
        receipt_id: `${id.warehouse}-${id.terminal}-${id.transaction}-${id.date}`,
        parser_version: receipt.parserVersion,
        items: items.map((i) => ({
          line_no: i.lineNo,
          item_number: i.itemNumber,
          description: i.description.slice(0, 200),
          quantity: i.quantity,
          unit_price_cents: i.linePriceCents,
          discount_cents: i.discountCents,
        })),
      },
    ],
  };
}

/** Applies a corrected line price; the price paid follows, less any linked discount. */
export function withPrice(item: ReceiptItem, linePriceCents: number): ReceiptItem {
  return { ...item, linePriceCents, pricePaidCents: Math.max(0, linePriceCents - item.discountCents) };
}
