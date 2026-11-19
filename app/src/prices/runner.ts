import type { FlagSummary, PriceCheckResultIn } from '../api/types';
import { readProductPage } from './extract';

/** What the in-app browser read for one item: the page text, or why there's none. */
export type PageRead = { text: string } | { error: 'timeout' };

export interface PriceCheckApi {
  priceChecksDue(): Promise<string[]>;
  reportPriceCheck(body: {
    started_at: string;
    finished_at: string;
    results: PriceCheckResultIn[];
  }): Promise<{ recorded: number; flagged: FlagSummary[] }>;
  reportPriceCheckFailure(
    code: 'challenge' | 'network',
    startedAt: string,
    finishedAt: string,
  ): Promise<void>;
}

export type Outcome =
  | { kind: 'nothingDue' }
  | { kind: 'done'; checked: number; flagged: FlagSummary[] }
  | { kind: 'needWarehouse' }
  /** costco.com challenged the check; it stops until tomorrow (ADR 0007). */
  | { kind: 'blocked'; checked: number; flagged: FlagSummary[] }
  /** Pages kept timing out (offline or very slow). */
  | { kind: 'failed' };

export interface RunOptions {
  api: PriceCheckApi;
  lookup: (itemNumber: string) => Promise<PageRead>;
  onProgress?: (done: number, total: number) => void;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Pause between items, at a personal-use rate (NFR-21). */
  pauseMs?: number;
  /** Give up after this many timeouts in a row. */
  maxTimeouts?: number;
}

/**
 * Looks up each due item on costco.com, one at a time, and reports the prices it read.
 * Stops at the first bot challenge and never retries around it.
 */
export async function runPriceCheck(options: RunOptions): Promise<Outcome> {
  const {
    api,
    lookup,
    onProgress,
    now = () => new Date(),
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    pauseMs = 4000,
    maxTimeouts = 3,
  } = options;

  const due = await api.priceChecksDue();
  if (due.length === 0) return { kind: 'nothingDue' };

  const startedAt = now().toISOString();
  const results: PriceCheckResultIn[] = [];
  let timeouts = 0;
  let stop: 'challenge' | 'needWarehouse' | 'timeouts' | null = null;

  for (const [i, item] of due.entries()) {
    onProgress?.(i, due.length);
    if (i > 0) await sleep(pauseMs);
    const page = await lookup(item);
    if ('error' in page) {
      timeouts += 1;
      if (timeouts >= maxTimeouts) {
        stop = 'timeouts';
        break;
      }
      continue;
    }
    timeouts = 0;
    const read = readProductPage(page.text, item);
    if (read.kind === 'challenge' || read.kind === 'needWarehouse') {
      stop = read.kind;
      break;
    }
    if (read.kind === 'notFound') results.push({ item_number: item, found: false });
    if (read.kind === 'found') {
      results.push({
        item_number: item,
        found: true,
        warehouse_price_cents: read.warehousePriceCents,
        online_price_cents: read.onlinePriceCents,
        promo_end: read.promoEnd,
      });
    }
  }
  onProgress?.(due.length, due.length);

  if (stop === 'needWarehouse' && results.length === 0) return { kind: 'needWarehouse' };
  const finishedAt = now().toISOString();
  const report = results.length
    ? await api.reportPriceCheck({ started_at: startedAt, finished_at: finishedAt, results })
    : { recorded: 0, flagged: [] };

  if (stop === 'challenge') {
    await api.reportPriceCheckFailure('challenge', startedAt, finishedAt);
    return { kind: 'blocked', checked: results.length, flagged: report.flagged };
  }
  if (stop === 'needWarehouse') return { kind: 'needWarehouse' };
  if (stop === 'timeouts' && results.length === 0) {
    await api.reportPriceCheckFailure('network', startedAt, finishedAt);
    return { kind: 'failed' };
  }
  return { kind: 'done', checked: results.length, flagged: report.flagged };
}
