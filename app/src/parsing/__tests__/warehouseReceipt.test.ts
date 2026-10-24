import { parseWarehouseReceipt, PARSER_VERSION } from '../warehouseReceipt';
import { CUT_OFF_RECEIPT, MISREAD_RECEIPT, SIMPLE_RECEIPT } from '../__fixtures__/receipts';

describe('parseWarehouseReceipt', () => {
  const parsed = parseWarehouseReceipt(SIMPLE_RECEIPT);

  it('reads each item line once and applies its instant saving', () => {
    expect(parsed.items.map((i) => [i.itemNumber, i.pricePaidCents])).toEqual([
      ['1111111', 499],
      ['2222222', 1999],
      ['4444444', 949],
    ]);
    expect(parsed.items[1]).toMatchObject({ linePriceCents: 2499, discountCents: 500, lineNo: 2 });
  });

  it('reads totals and the receipt identifier', () => {
    expect(parsed).toMatchObject({
      subtotalCents: 3447,
      taxCents: 207,
      totalCents: 3654,
      instantSavingsCents: 500,
      itemsSold: 3,
      receiptId: { warehouse: '999', terminal: '2', transaction: '123', date: '2026-10-01' },
      parserVersion: PARSER_VERSION,
    });
  });

  it('balances when every check passes', () => {
    expect(parsed.checks.every((c) => c.passed)).toBe(true);
    expect(parsed.balanced).toBe(true);
  });

  it('never keeps payment details', () => {
    const everything = JSON.stringify(parsed);
    expect(everything).not.toMatch(/X{4,}|APPROVED|VISA|CHIP/);
  });

  it('catches a misread price with the subtotal check', () => {
    const misread = parseWarehouseReceipt(MISREAD_RECEIPT);
    const subtotal = misread.checks.find((c) => c.name === 'subtotal')!;
    expect(subtotal).toEqual({ name: 'subtotal', passed: false, expected: 3447, actual: 3437 });
    expect(misread.balanced).toBe(false);
  });

  it('does not balance when the totals are missing', () => {
    const cut = parseWarehouseReceipt(CUT_OFF_RECEIPT);
    expect(cut.balanced).toBe(false);
    expect(cut.checks.find((c) => c.name === 'itemCount')!.passed).toBe(false);
    expect(cut.receiptId).toBeNull();
  });

  it('flags a discount that points at no item', () => {
    const rows = [...SIMPLE_RECEIPT];
    rows.splice(7, 0, '5555555 / 9999999 1.00-');
    const result = parseWarehouseReceipt(rows);
    expect(result.unparsedRows).toContain('discount for 9999999 not matched to an item');
    expect(result.balanced).toBe(false);
  });

  it('balances a receipt with no instant savings and no savings line', () => {
    const rows = [
      'E 1111111 KS EXAMPLE A 4.99 Y',
      'SUBTOTAL 4.99',
      '10/01/2026 10:30',
      'Whse: 999 Trm: 2 Trn: 124',
      'Items Sold: 1',
    ];
    expect(parseWarehouseReceipt(rows).balanced).toBe(true);
  });
});
