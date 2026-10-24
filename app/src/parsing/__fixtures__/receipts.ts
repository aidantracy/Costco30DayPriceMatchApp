/**
 * Invented receipts for parser tests. Layout follows spike S-1; every value
 * (warehouse, items, prices, transaction, card digits) is made up.
 */
export const SIMPLE_RECEIPT: string[] = [
  'SAMPLE #999',
  '100 EXAMPLE WAY',
  'SAMPLE CITY, ST 00000',
  '21099900201232610011030',
  'E 1111111 KS EXAMPLE A 4.99 Y',
  '2222222 EXAMPLE GADGET 24.99 Y',
  '3333333 / 2222222 5.00-',
  'E 4444444 EXAMPLE SNACK 9.49 Y',
  'SUBTOTAL 34.47',
  'TAX 2.07',
  '**** TOTAL 36.54',
  'XXXXXXXXXXXX0000 CHIP read',
  'APPROVED - PURCHASE',
  'AMOUNT: $36.54',
  '10/01/2026 10:30 999 2 123 45',
  'VISA 36.54',
  'CHANGE 0',
  'TOTAL NUMBER OF ITEMS SOLD = 3',
  'INSTANT SAVINGS $5.00',
  'Thank You!',
  'Please Come Again',
  'Whse: 999 Trm: 2 Trn: 123 OPT: 45',
  'Items Sold: 3',
];

/** Same receipt, but text recognition read 4.99 as 4.89. */
export const MISREAD_RECEIPT: string[] = SIMPLE_RECEIPT.map((r) =>
  r === 'E 1111111 KS EXAMPLE A 4.99 Y' ? 'E 1111111 KS EXAMPLE A 4.89 Y' : r,
);

/** Screenshot cut off before the totals. */
export const CUT_OFF_RECEIPT: string[] = SIMPLE_RECEIPT.slice(0, 8);

/** Two screenshots taken while scrolling; rows 5 to 8 appear in both. */
export const SCREENSHOT_1: string[] = SIMPLE_RECEIPT.slice(0, 8);
export const SCREENSHOT_2: string[] = SIMPLE_RECEIPT.slice(4);
