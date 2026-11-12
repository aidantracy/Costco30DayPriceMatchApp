import { readScreenshots } from '../../import/receipt';
import { APP_SHOT_1, APP_SHOT_2, APP_SHOT_TALL } from '../__fixtures__/appScreenshots';

const EXPECTED_ITEMS = [
  {
    itemNumber: '1111111',
    description: 'KS EXAMPLE A',
    quantity: 1,
    linePriceCents: 499,
    discountCents: 0,
  },
  {
    itemNumber: '2222222',
    description: 'EXAMPLE GADGET',
    quantity: 1,
    linePriceCents: 1999,
    discountCents: 400,
  },
  {
    itemNumber: '4444444',
    description: 'EXAMPLE SNACK',
    quantity: 1,
    linePriceCents: 949,
    discountCents: 0,
  },
  {
    itemNumber: '5555555',
    description: 'EXAMPLE TWIN PK',
    quantity: 2,
    linePriceCents: 1698,
    discountCents: 300,
  },
  {
    itemNumber: '7777777',
    description: 'EXAMPLE DIAPER',
    quantity: 1,
    linePriceCents: 2999,
    discountCents: 500,
  },
];

test.each([
  ['two overlapping screenshots', [APP_SHOT_1, APP_SHOT_2]],
  ['one tall scrolling screenshot', [APP_SHOT_TALL]],
])('reads a receipt from the Costco app layout: %s', (_name, shots) => {
  const receipt = readScreenshots(shots);
  expect(receipt.items).toEqual(
    EXPECTED_ITEMS.map((i, n) => expect.objectContaining({ ...i, lineNo: n + 1 })),
  );
  expect(receipt.receiptId).toEqual({
    warehouse: '999',
    terminal: '3',
    transaction: '123',
    date: '2026-10-31',
  });
  expect(receipt.checks.map((c) => [c.name, c.passed])).toEqual([
    ['itemCount', true],
    ['subtotal', true],
    ['instantSavings', true],
  ]);
  expect(receipt.balanced).toBe(true);
  // Phone and app screen text above and below the receipt isn't reported as missed lines.
  expect(receipt.unparsedRows).toEqual([]);
});
