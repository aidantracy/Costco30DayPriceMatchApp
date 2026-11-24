import type { PriceIn } from '../api/types';
import type { OcrElement } from '../parsing/types';
import {
  parseWarehouseSavings,
  type ParsedSavings,
  type SavingsOffer,
} from '../parsing/warehouseSavings';

/** Turns the text read from the Costco app's Warehouse Savings list, page by page, into offers. */
export function readSavingsPages(pages: OcrElement[][]): ParsedSavings {
  return parseWarehouseSavings(pages);
}

/**
 * The day the prices were seen: the list's "Viewed on" date, or today when the screen
 * didn't show it (or it's somehow later than today).
 */
export function seenOn(savings: ParsedSavings, today: string): string {
  return savings.viewedOn && savings.viewedOn <= today ? savings.viewedOn : today;
}

/** Offers that are still running on the day they were seen. */
export function currentOffers(savings: ParsedSavings, today: string): SavingsOffer[] {
  const day = seenOn(savings, today);
  return savings.offers.filter((o) => o.validThrough >= day);
}

/** Warehouse prices for the API, one per offer still running (FR-05: the price after savings). */
export function toPrices(savings: ParsedSavings, offers: SavingsOffer[], today: string): PriceIn[] {
  const day = seenOn(savings, today);
  return offers
    .filter((o) => o.validThrough >= day)
    .map((o) => ({
      item_number: o.itemNumber,
      channel: 'warehouse',
      price_cents: o.priceCents,
      seen_on: day,
      promo_end: o.validThrough,
      quantity_limit: o.limit,
    }));
}
