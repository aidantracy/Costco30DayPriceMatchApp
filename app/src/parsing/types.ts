/** A piece of text from on-device text recognition, with its box when the engine provides one. */
export interface OcrElement {
  text: string;
  frame?: { left: number; top: number; right: number; bottom: number };
}

export interface ReceiptId {
  warehouse: string;
  terminal: string;
  transaction: string;
  /** ISO date (YYYY-MM-DD) in the warehouse's local time. */
  date: string;
}

export interface ReceiptItem {
  itemNumber: string;
  description: string;
  /** Printed line price, in cents. */
  linePriceCents: number;
  /** Instant savings linked to this item, in cents (positive number). */
  discountCents: number;
  /** What was actually paid: line price minus linked discounts (FR-05). */
  pricePaidCents: number;
  quantity: number;
  /** Position on the receipt, starting at 1. */
  lineNo: number;
}

export interface Check {
  name: 'itemCount' | 'subtotal' | 'instantSavings';
  passed: boolean;
  expected: number | null;
  actual: number;
}

export interface ParsedReceipt {
  parserVersion: string;
  receiptId: ReceiptId | null;
  items: ReceiptItem[];
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  instantSavingsCents: number | null;
  itemsSold: number | null;
  checks: Check[];
  /** True only when every check passed and the receipt identifier was found. */
  balanced: boolean;
  /** Rows the parser could not classify, for the correction screen. Never includes payment details. */
  unparsedRows: string[];
}
