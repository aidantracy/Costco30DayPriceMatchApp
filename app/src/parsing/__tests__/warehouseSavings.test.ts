import { SAVINGS_PAGE_1, SAVINGS_PAGE_2 } from '../__fixtures__/savingsScreens';
import type { OcrElement } from '../types';
import { parseWarehouseSavings, SAVINGS_PARSER_VERSION } from '../warehouseSavings';

function line(text: string, left: number, top: number, height = 34): OcrElement {
  return { text, frame: { left, top, right: left + text.length * 17, bottom: top + height } };
}

describe('parseWarehouseSavings', () => {
  const parsed = parseWarehouseSavings([SAVINGS_PAGE_1, SAVINGS_PAGE_2]);
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

  it('completes an offer split across two pages', () => {
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

  it('gives the same result whichever order the pages come in', () => {
    const reversed = parseWarehouseSavings([SAVINGS_PAGE_2, SAVINGS_PAGE_1]);
    expect(new Set(reversed.offers.map((o) => o.itemNumber))).toEqual(
      new Set(parsed.offers.map((o) => o.itemNumber)),
    );
    expect(reversed.offers.find((o) => o.itemNumber === '1100004')?.limit).toBe(10);
  });

  it('returns nothing for a screen that is not the savings list', () => {
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

  it('joins offers split by a page break with no overlap', () => {
    const page1 = [
      line('EXAMPLE ITEM ONE', 380, 100),
      line('Item 1100011', 380, 160, 30),
      line('$9.99', 380, 210, 56),
      line('After $2 OFF', 380, 320),
      line('Valid Through Dec 1, 2026', 380, 380, 30),
      line('In Stock', 380, 445, 40),
      // Item number at the very bottom; its price and dates are on the next page.
      line('EXAMPLE ITEM TWO', 380, 2200),
      line('Item 1100012', 380, 2260, 30),
      // The next offer's name starts at the bottom edge.
      line('EXAMPLE ITEM', 380, 2330),
    ];
    const page2 = [
      line('$14 99', 380, 20, 56),
      line('After $5 OFF', 380, 130),
      line('Valid Through Dec 20, 2026', 380, 190, 30),
      line('Limit 2 per member', 380, 255, 30),
      line('THREE 2PK', 380, 330),
      line('Item 1100013', 380, 390, 30),
      line('$4.49', 380, 440, 56),
      line('Valid Through Dec 7, 2026', 380, 550, 30),
    ];
    const result = parseWarehouseSavings([page1, page2]);
    expect(result.incomplete).toEqual([]);
    expect(result.offers.find((o) => o.itemNumber === '1100012')).toEqual({
      itemNumber: '1100012',
      name: 'EXAMPLE ITEM TWO',
      priceCents: 1499,
      discountCents: 500,
      validThrough: '2026-12-20',
      limit: 2,
    });
    expect(result.offers.find((o) => o.itemNumber === '1100013')?.name).toBe(
      'EXAMPLE ITEM THREE 2PK',
    );
  });

  it("doesn't change a finished offer with the next page's top", () => {
    const page1 = [
      line('EXAMPLE ITEM ONE', 380, 100),
      line('Item 1100021', 380, 160, 30),
      line('$9.99', 380, 210, 56),
      line('Valid Through Dec 1, 2026', 380, 380, 30),
    ];
    const page2 = [
      line('Limit 4 per member', 380, 20, 30),
      line('EXAMPLE ITEM TWO', 380, 100),
      line('Item 1100022', 380, 160, 30),
      line('$5.99', 380, 210, 56),
      line('Valid Through Dec 2, 2026', 380, 380, 30),
    ];
    const one = parseWarehouseSavings([page1, page2]).offers[0];
    expect(one.priceCents).toBe(999);
    // Only a missing field is filled in from the top of the next page.
    expect(one.limit).toBe(4);
  });

  it('reads prices of $1,000 and more however the cents come out', () => {
    const offer = (price: string, sup?: string) => {
      const shot = [
        line('EXAMPLE GAMING LAPTOP', 380, 100),
        line('Item 1100031', 380, 160, 30),
        line(price, 380, 210, 56),
        ...(sup ? [line(sup, 380 + price.length * 28 + 10, 208, 28)] : []),
        line('Valid Through Dec 1, 2026', 380, 380, 30),
      ];
      return parseWarehouseSavings([shot]).offers[0]?.priceCents ?? null;
    };
    expect(offer('$1,29999')).toBe(129999);
    expect(offer('$1,299 99')).toBe(129999);
    expect(offer('$1,299.99')).toBe(129999);
    expect(offer('$1,299', '99')).toBe(129999);
    expect(offer('$129999')).toBe(129999);
    // Without its cents a comma price is ambiguous, so it isn't guessed.
    expect(offer('$1,299')).toBeNull();
  });

  it('gives the top of an overlapping page to the offer above it, not the last one read', () => {
    const page1 = [
      line('EXAMPLE ITEM ONE', 380, 100),
      line('Item 1100041', 380, 160, 30),
      line('$9.99', 380, 210, 56),
      line('Valid Through Dec 1, 2026', 380, 380, 30),
      line('EXAMPLE ITEM TWO', 380, 700),
      line('Item 1100042', 380, 760, 30),
      line('$5.99', 380, 810, 56),
      line('Valid Through Dec 2, 2026', 380, 980, 30),
      // Cut off: no price yet.
      line('EXAMPLE ITEM THREE', 380, 1300),
      line('Item 1100043', 380, 1360, 30),
    ];
    // Scrolled half a page: starts in the middle of offer two.
    const page2 = [
      line('Limit 3 per member', 380, 50, 30),
      line('EXAMPLE ITEM THREE', 380, 200),
      line('Item 1100043', 380, 260, 30),
      line('$7.49', 380, 310, 56),
      line('Valid Through Dec 3, 2026', 380, 480, 30),
    ];
    const result = parseWarehouseSavings([page1, page2]);
    expect(result.incomplete).toEqual([]);
    const byItem = (n: string) => result.offers.find((o) => o.itemNumber === n);
    expect(byItem('1100042')?.limit).toBe(3);
    expect(byItem('1100043')).toMatchObject({ priceCents: 749, limit: null });
  });
});
