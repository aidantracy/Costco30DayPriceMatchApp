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
    expect(parsed.items[1]).toMatchObject({
      linePriceCents: 2499,
      discountCents: 500,
      lineNo: 2,
    });
  });

  it('reads totals and the receipt identifier', () => {
    expect(parsed).toMatchObject({
      subtotalCents: 3447,
      taxCents: 207,
      totalCents: 3654,
      instantSavingsCents: 500,
      itemsSold: 3,
      receiptId: {
        warehouse: '999',
        terminal: '2',
        transaction: '123',
        date: '2026-10-01',
      },
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
    expect(subtotal).toEqual({
      name: 'subtotal',
      passed: false,
      expected: 3447,
      actual: 3437,
    });
    expect(misread.balanced).toBe(false);
  });

  it('does not balance when the totals are missing, but still reads the barcode', () => {
    const cut = parseWarehouseReceipt(CUT_OFF_RECEIPT);
    expect(cut.balanced).toBe(false);
    expect(cut.checks.find((c) => c.name === 'itemCount')!.passed).toBe(false);
    expect(cut.receiptId).toEqual({
      warehouse: '999',
      terminal: '2',
      transaction: '123',
      date: '2026-10-01',
    });
  });

  it('has no identifier without the barcode, date line or footer', () => {
    const rows = CUT_OFF_RECEIPT.filter((r) => !/^\d{20,}$/.test(r));
    expect(parseWarehouseReceipt(rows).receiptId).toBeNull();
  });

  it('applies a discount naming another number to the item printed above it', () => {
    const rows = SIMPLE_RECEIPT.map((r) =>
      r === '3333333 / 2222222 5.00-' ? '3333333 / 2222299 5.00-' : r,
    );
    const result = parseWarehouseReceipt(rows);
    expect(result.items[1]).toMatchObject({
      itemNumber: '2222222',
      discountCents: 500,
    });
    expect(result.balanced).toBe(true);
  });

  it('flags a discount with no item to apply to', () => {
    const rows = [...SIMPLE_RECEIPT];
    rows.splice(4, 0, '5555555 / 9999999 1.00-');
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

  it('rejoins rows that text recognition split apart and reads a multi-unit line', () => {
    // Invented values, in the order a real phone produced them.
    const rows = [
      '21099900301232610311143',
      '1111111 KS EXAMPLE A 4.99 Y',
      '2@ 8.49',
      'TWIN 16.98',
      '5555555',
      'LONG PK',
      '29.99',
      '7777777 EXAMPLE DIAPER Y',
      '8888888 / 7777777 5.00-',
      'SUBTOTAL 46.96',
      'TOTAL NUMBER OF ITEMS SOLD = 4',
      'INSTANT SAVINGS $5.00',
    ];
    const result = parseWarehouseReceipt(rows);
    expect(
      result.items.map((i) => [i.itemNumber, i.description, i.quantity, i.linePriceCents]),
    ).toEqual([
      ['1111111', 'KS EXAMPLE A', 1, 499],
      ['5555555', 'TWIN LONG PK', 2, 1698],
      ['7777777', 'EXAMPLE DIAPER', 1, 2999],
    ]);
    expect(result.receiptId).toEqual({
      warehouse: '999',
      terminal: '3',
      transaction: '123',
      date: '2026-10-31',
    });
    expect(result.balanced).toBe(true);
  });

  it('ignores a quantity line whose total does not match the next item', () => {
    const result = parseWarehouseReceipt(['3 @ 1.00', '1111111 KS EXAMPLE A 4.99 Y']);
    expect(result.items[0].quantity).toBe(1);
  });

  it('only reports unrecognized rows between the first item and the subtotal', () => {
    const result = parseWarehouseReceipt([
      'Orders & Purchases',
      '1111111 KS EXAMPLE A 4.99 Y',
      'SOMETHING ODD 1.2',
      'SUBTOTAL 4.99',
      'Explore Shop Account',
    ]);
    expect(result.unparsedRows).toEqual(['SOMETHING ODD 1.2']);
  });

  it('reads the identifier from the date line', () => {
    const result = parseWarehouseReceipt([
      '1111111 KS EXAMPLE A 4.99 Y',
      '10/31/2026 11:43 998 4 321 67',
    ]);
    expect(result.receiptId).toEqual({
      warehouse: '998',
      terminal: '4',
      transaction: '321',
      date: '2026-10-31',
    });
  });
});
