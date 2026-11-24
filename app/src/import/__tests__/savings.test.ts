import type { ParsedSavings, SavingsOffer } from '../../parsing/warehouseSavings';
import { currentOffers, seenOn, toPrices } from '../savings';

const offer = (over: Partial<SavingsOffer> = {}): SavingsOffer => ({
  itemNumber: '1100001',
  name: 'EXAMPLE ITEM',
  priceCents: 1299,
  discountCents: 400,
  validThrough: '2026-11-30',
  limit: 10,
  ...over,
});

const parsed = (over: Partial<ParsedSavings> = {}): ParsedSavings => ({
  parserVersion: 'warehouse-savings/1',
  viewedOn: '2026-11-23',
  offers: [offer(), offer({ itemNumber: '1100002', validThrough: '2026-11-20', limit: null })],
  incomplete: [],
  ...over,
});

describe('seenOn', () => {
  it('uses the viewed-on date, or today when it is missing or later', () => {
    expect(seenOn(parsed(), '2026-11-24')).toBe('2026-11-23');
    expect(seenOn(parsed({ viewedOn: null }), '2026-11-24')).toBe('2026-11-24');
    expect(seenOn(parsed({ viewedOn: '2026-11-25' }), '2026-11-24')).toBe('2026-11-24');
  });
});

describe('toPrices', () => {
  it('sends warehouse prices with the end date and limit, leaving out ended offers', () => {
    const s = parsed();
    expect(currentOffers(s, '2026-11-24').map((o) => o.itemNumber)).toEqual(['1100001']);
    expect(toPrices(s, s.offers, '2026-11-24')).toEqual([
      {
        item_number: '1100001',
        channel: 'warehouse',
        price_cents: 1299,
        seen_on: '2026-11-23',
        promo_end: '2026-11-30',
        quantity_limit: 10,
      },
    ]);
  });

  it('counts the last day of an offer as running', () => {
    const s = parsed({ viewedOn: '2026-11-30' });
    expect(toPrices(s, s.offers, '2026-11-30').map((p) => p.item_number)).toEqual(['1100001']);
  });
});
