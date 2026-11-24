import { SAVINGS_SHOT_1, SAVINGS_SHOT_2 } from '../__fixtures__/savingsScreenshots';
import type { OcrElement } from '../types';
import { parseWarehouseSavings, SAVINGS_PARSER_VERSION } from '../warehouseSavings';

function line(text: string, left: number, top: number, height = 34): OcrElement {
  return { text, frame: { left, top, right: left + text.length * 17, bottom: top + height } };
}

describe('parseWarehouseSavings', () => {
  const parsed = parseWarehouseSavings([SAVINGS_SHOT_1, SAVINGS_SHOT_2]);
  const offer = (item: string) => parsed.offers.find((o) => o.itemNumber === item);

  it('reads every complete offer once, in list order', () => {
    expect(parsed.parserVersion).toBe(SAVINGS_PARSER_VERSION);
    expect(parsed.offers.map((o) => o.itemNumber)).toEqual([
      '1100001',
      '1100002',
      '1100003',
      '1100004',
      '1100005',
      '1100006',
    ]);
  });

  it('reads the viewed-on date but nothing about the warehouse', () => {
    expect(parsed.viewedOn).toBe('2026-11-23');
    expect(JSON.stringify(parsed)).not.toContain('Sampletown');
  });

  it('reads the price however the superscript cents were recognized', () => {
    expect(offer('1100001')?.priceCents).toBe(1299); // "$12" + "99"
    expect(offer('1100002')?.priceCents).toBe(729); // "$729"
    expect(offer('1100003')?.priceCents).toBe(779); // "$7.79"
    expect(offer('1100005')?.priceCents).toBe(679); // "$6 79"
    expect(offer('1100006')?.priceCents).toBe(129999); // "$1,299" + "99"
  });

  it('reads savings, end date and limit', () => {
    expect(offer('1100002')).toEqual({
      itemNumber: '1100002',
      name: 'SAMPLE BRAND DARK CHOCOLATE 16 OZ',
      priceCents: 729,
      discountCents: 370,
      validThrough: '2026-12-20',
      limit: 5,
    });
    expect(offer('1100003')?.limit).toBeNull();
  });

  it('keeps names to the capitalized lines and ignores photo text and notes', () => {
    expect(offer('1100001')?.name).toBe('EXAMPLE KNIT HAT 2PK');
    expect(offer('1100003')?.name).toBe('EXAMPLE SOUP STOCK 6/32 OZ');
    expect(offer('1100005')?.name).toBe('SAMPLE BAKERY MADELEINES 28 OZ');
  });

  it('completes an offer split across two screenshots', () => {
    expect(offer('1100004')).toEqual({
      itemNumber: '1100004',
      name: 'SAMPLE PORCH LIGHT ^',
      priceCents: 2799,
      discountCents: 700,
      validThrough: '2026-12-20',
      limit: 10,
    });
  });

  it('lists offers that were cut off', () => {
    expect(parsed.incomplete).toEqual(['EXAMPLE PARTY CUPS 140/18 OZ (#1100007)']);
  });

  it('gives the same result whichever order the screenshots are picked in', () => {
    const reversed = parseWarehouseSavings([SAVINGS_SHOT_2, SAVINGS_SHOT_1]);
    expect(new Set(reversed.offers.map((o) => o.itemNumber))).toEqual(
      new Set(parsed.offers.map((o) => o.itemNumber)),
    );
    expect(reversed.offers.find((o) => o.itemNumber === '1100004')?.limit).toBe(10);
  });

  it('returns nothing for a screenshot that is not a savings list', () => {
    const other = parseWarehouseSavings([[line('Orders & Purchases', 40, 100)]]);
    expect(other).toEqual({
      parserVersion: SAVINGS_PARSER_VERSION,
      viewedOn: null,
      offers: [],
      incomplete: [],
    });
  });

  it('marks a price it cannot read as incomplete', () => {
    const shot = [
      line('EXAMPLE ITEM', 380, 100),
      line('Item 1100008', 380, 160, 30),
      line('$7', 380, 210, 56),
      line('Valid Through Dec 1, 2026', 380, 320, 30),
    ];
    const result = parseWarehouseSavings([shot]);
    expect(result.offers).toEqual([]);
    expect(result.incomplete).toEqual(['EXAMPLE ITEM (#1100008)']);
  });

  it('rejects impossible dates', () => {
    const shot = [
      line('EXAMPLE ITEM', 380, 100),
      line('Item 1100009', 380, 160, 30),
      line('$7.99', 380, 210, 56),
      line('Valid Through Feb 30, 2027', 380, 320, 30),
    ];
    expect(parseWarehouseSavings([shot]).offers).toEqual([]);
  });
});
