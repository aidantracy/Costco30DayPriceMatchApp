import type { FlagSummary, PriceCheckResultIn } from '../../api/types';
import { runPriceCheck, type PageRead, type PriceCheckApi } from '../runner';

const page = (item: string, warehouse: string) =>
  `My Warehouse\nSample Town\nOpen\nItem ${item}\nOnline Price\n$9.99\nWarehouse Price\n$\n${warehouse}`;
const NOT_FOUND = 'We were not able to find a match.';
const DROP: FlagSummary = {
  id: 'f1',
  purchase_id: 'p1',
  item_number: '2222222',
  description: 'EXAMPLE GADGET',
  refund_due_cents: 500,
  claim_deadline: '2026-10-20',
};

function fakeApi(due: string[], flagged: FlagSummary[] = []) {
  const reports: PriceCheckResultIn[][] = [];
  const failures: string[] = [];
  const api: PriceCheckApi = {
    priceChecksDue: async () => due,
    reportPriceCheck: async (body) => {
      reports.push(body.results);
      return { recorded: body.results.length, flagged };
    },
    reportPriceCheckFailure: async (code) => {
      failures.push(code);
    },
  };
  return { api, reports, failures };
}

function pages(map: Record<string, PageRead>) {
  const asked: string[] = [];
  const lookup = async (item: string) => {
    asked.push(item);
    return map[item];
  };
  return { lookup, asked };
}

const fast = { sleep: async () => undefined, now: () => new Date('2026-10-01T18:00:00Z') };

test('nothing due makes no lookups', async () => {
  const { api } = fakeApi([]);
  const { lookup, asked } = pages({});
  expect(await runPriceCheck({ api, lookup, ...fast })).toEqual({ kind: 'nothingDue' });
  expect(asked).toEqual([]);
});

test('reports found and not-found items and returns drops', async () => {
  const { api, reports } = fakeApi(['1111111', '2222222', '3333333'], [DROP]);
  const { lookup } = pages({
    '1111111': { text: page('1111111', '4.99') },
    '2222222': { text: page('2222222', '14.99') },
    '3333333': { text: NOT_FOUND },
  });
  const progress: number[] = [];
  const outcome = await runPriceCheck({
    api,
    lookup,
    onProgress: (d) => progress.push(d),
    ...fast,
  });
  expect(outcome).toEqual({ kind: 'done', checked: 3, flagged: [DROP] });
  expect(reports[0]).toEqual([
    {
      item_number: '1111111',
      found: true,
      warehouse_price_cents: 499,
      online_price_cents: 999,
      promo_end: null,
    },
    {
      item_number: '2222222',
      found: true,
      warehouse_price_cents: 1499,
      online_price_cents: 999,
      promo_end: null,
    },
    { item_number: '3333333', found: false },
  ]);
  expect(progress).toEqual([0, 1, 2, 3]);
});

test('pauses between items, not before the first', async () => {
  const { api } = fakeApi(['1111111', '2222222']);
  const { lookup } = pages({
    '1111111': { text: NOT_FOUND },
    '2222222': { text: NOT_FOUND },
  });
  const pauses: number[] = [];
  await runPriceCheck({
    api,
    lookup,
    ...fast,
    pauseMs: 4000,
    sleep: async (ms) => void pauses.push(ms),
  });
  expect(pauses).toEqual([4000]);
});

test('stops at a challenge, keeps what it read and reports the failure', async () => {
  const { api, reports, failures } = fakeApi(['1111111', '2222222', '3333333']);
  const { lookup, asked } = pages({
    '1111111': { text: page('1111111', '4.99') },
    '2222222': { text: 'Access Denied' },
  });
  expect(await runPriceCheck({ api, lookup, ...fast })).toEqual({
    kind: 'blocked',
    checked: 1,
    flagged: [],
  });
  expect(asked).toEqual(['1111111', '2222222']);
  expect(reports[0]).toHaveLength(1);
  expect(failures).toEqual(['challenge']);
});

test('a challenge on the first item reports only the failure', async () => {
  const { api, reports, failures } = fakeApi(['1111111']);
  const { lookup } = pages({ '1111111': { text: 'Pardon Our Interruption' } });
  expect((await runPriceCheck({ api, lookup, ...fast })).kind).toBe('blocked');
  expect(reports).toEqual([]);
  expect(failures).toEqual(['challenge']);
});

test('asks for a warehouse when none is chosen', async () => {
  const { api, reports } = fakeApi(['1111111', '2222222']);
  const { lookup } = pages({
    '1111111': { text: 'Set My Warehouse\nItem 1111111\nOnline Price\n$9.99' },
  });
  expect(await runPriceCheck({ api, lookup, ...fast })).toEqual({ kind: 'needWarehouse' });
  expect(reports).toEqual([]);
});

test('a missing warehouse after some items still saves those items', async () => {
  const { api, reports } = fakeApi(['1111111', '2222222']);
  const { lookup } = pages({
    '1111111': { text: NOT_FOUND },
    '2222222': { text: 'Set My Warehouse\nItem 2222222\nOnline Price\n$9.99' },
  });
  expect(await runPriceCheck({ api, lookup, ...fast })).toEqual({ kind: 'needWarehouse' });
  expect(reports[0]).toEqual([{ item_number: '1111111', found: false }]);
});

test('skips unreadable pages and single timeouts', async () => {
  const { api, reports } = fakeApi(['1111111', '2222222', '3333333']);
  const { lookup } = pages({
    '1111111': { text: 'Loading…' },
    '2222222': { error: 'timeout' },
    '3333333': { text: NOT_FOUND },
  });
  expect((await runPriceCheck({ api, lookup, ...fast })).kind).toBe('done');
  expect(reports[0]).toEqual([{ item_number: '3333333', found: false }]);
});

test('gives up after repeated timeouts and reports a network failure', async () => {
  const { api, failures } = fakeApi(['1111111', '2222222', '3333333', '4444444']);
  const { lookup, asked } = pages({
    '1111111': { error: 'timeout' },
    '2222222': { error: 'timeout' },
    '3333333': { error: 'timeout' },
  });
  expect(await runPriceCheck({ api, lookup, ...fast, maxTimeouts: 3 })).toEqual({ kind: 'failed' });
  expect(asked).toHaveLength(3);
  expect(failures).toEqual(['network']);
});

test('repeated timeouts after some results still save them', async () => {
  const { api, reports, failures } = fakeApi(['1111111', '2222222']);
  const { lookup } = pages({ '1111111': { text: NOT_FOUND }, '2222222': { error: 'timeout' } });
  expect((await runPriceCheck({ api, lookup, ...fast, maxTimeouts: 1 })).kind).toBe('done');
  expect(reports).toHaveLength(1);
  expect(failures).toEqual([]);
});

test('uses real timers and clock by default', async () => {
  const { api } = fakeApi(['1111111', '2222222']);
  const { lookup } = pages({ '1111111': { text: NOT_FOUND }, '2222222': { text: NOT_FOUND } });
  expect((await runPriceCheck({ api, lookup, pauseMs: 1 })).kind).toBe('done');
});
