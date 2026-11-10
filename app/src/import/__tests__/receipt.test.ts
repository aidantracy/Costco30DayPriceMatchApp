import {
  CUT_OFF_RECEIPT,
  MISREAD_RECEIPT,
  SCREENSHOT_1,
  SCREENSHOT_2,
  SIMPLE_RECEIPT,
} from '../../parsing/__fixtures__/receipts';
import type { OcrElement } from '../../parsing/types';
import { problems, readScreenshots, recheck, toBatch, withPrice } from '../receipt';

const TODAY = '2026-10-10';

/** Lays rows out top to bottom, splitting the price into its own box like ML Kit often does. */
function shot(rows: string[]): OcrElement[] {
  return rows.flatMap((text, i) => {
    const top = i * 30;
    const m = /^(.*\S)\s+(\d+\.\d{2}-?(?:\s+[A-Z])?)$/.exec(text);
    if (!m) return [{ text, frame: { left: 0, top, right: 300, bottom: top + 20 } }];
    return [
      { text: m[2], frame: { left: 400, top: top + 1, right: 480, bottom: top + 21 } },
      { text: m[1], frame: { left: 0, top, right: 300, bottom: top + 20 } },
    ];
  });
}

test('overlapping screenshots become one balanced receipt', () => {
  const receipt = readScreenshots([shot(SCREENSHOT_1), shot(SCREENSHOT_2)]);
  expect(receipt.balanced).toBe(true);
  expect(receipt.items.map((i) => i.itemNumber)).toEqual(['1111111', '2222222', '4444444']);
  expect(problems(receipt, receipt.checks)).toEqual([]);
});

test('the import request uses the receipt identifier and printed prices', () => {
  const receipt = readScreenshots([shot(SIMPLE_RECEIPT)]);
  const body = toBatch(receipt, receipt.items, TODAY);
  expect(body).toEqual({
    source: 'screenshot',
    receipts: [
      {
        channel: 'warehouse',
        purchase_date: '2026-10-01',
        warehouse_number: '999',
        receipt_id: '999-2-123-2026-10-01',
        parser_version: 'warehouse-receipt/1',
        items: [
          expect.objectContaining({ line_no: 1, item_number: '1111111', unit_price_cents: 499, discount_cents: 0 }),
          expect.objectContaining({ line_no: 2, item_number: '2222222', unit_price_cents: 2499, discount_cents: 500 }),
          expect.objectContaining({ line_no: 3, item_number: '4444444', quantity: 1, description: 'EXAMPLE SNACK' }),
        ],
      },
    ],
  });
});

test('no request without an identifier, with a future date, or with no items', () => {
  const cut = readScreenshots([shot(CUT_OFF_RECEIPT)]);
  expect(toBatch(cut, cut.items, TODAY)).toBeNull();
  const full = readScreenshots([shot(SIMPLE_RECEIPT)]);
  expect(toBatch(full, full.items, '2026-09-30')).toBeNull();
  expect(toBatch(full, [], TODAY)).toBeNull();
});

test('a misread price fails the subtotal until it is corrected', () => {
  const receipt = readScreenshots([shot(MISREAD_RECEIPT)]);
  expect(problems(receipt, recheck(receipt, receipt.items))).toEqual([
    'Items add up to $34.37, but the subtotal is $34.47. Check the prices.',
  ]);
  const fixed = receipt.items.map((i) => (i.itemNumber === '1111111' ? withPrice(i, 499) : i));
  expect(recheck(receipt, fixed).every((c) => c.passed)).toBe(true);
});

test('removing a line is caught by the item count', () => {
  const receipt = readScreenshots([shot(SIMPLE_RECEIPT)]);
  const fewer = receipt.items.filter((i) => i.itemNumber !== '4444444');
  expect(problems(receipt, recheck(receipt, fewer))).toEqual([
    'Found 2 items, but the receipt says 3. A line may be missing.',
    'Items add up to $24.98, but the subtotal is $34.47. Check the prices.',
  ]);
});

test('a cut-off receipt asks for the bottom of the receipt', () => {
  const receipt = readScreenshots([shot(CUT_OFF_RECEIPT)]);
  expect(problems(receipt, recheck(receipt, receipt.items))).toEqual([
    expect.stringContaining("Couldn't find the receipt number"),
    expect.stringContaining("Couldn't find the number of items sold"),
    expect.stringContaining("Couldn't find the subtotal"),
    expect.stringContaining("Couldn't find the instant savings total"),
  ]);
});

test('instant savings that disagree with the discounts are reported', () => {
  const receipt = readScreenshots([
    shot(SIMPLE_RECEIPT.map((r) => (r === 'INSTANT SAVINGS $5.00' ? 'INSTANT SAVINGS $6.00' : r))),
  ]);
  expect(problems(receipt, recheck(receipt, receipt.items))).toEqual([
    'Discounts add up to $5.00, but instant savings are $6.00.',
  ]);
});

test('withPrice keeps the linked discount and never goes negative', () => {
  const receipt = readScreenshots([shot(SIMPLE_RECEIPT)]);
  const gadget = receipt.items[1];
  expect(withPrice(gadget, 2599)).toMatchObject({ linePriceCents: 2599, pricePaidCents: 2099 });
  expect(withPrice(gadget, 100).pricePaidCents).toBe(0);
});
