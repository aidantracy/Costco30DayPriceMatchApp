import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, AppState, Pressable, Text } from 'react-native';

import { fakeFetch, TOKENS } from '../../api/__fixtures__/fakeServer';
import { AuthProvider } from '../../auth/AuthContext';
import { memoryTokenStore } from '../../auth/tokenStore';
import { PriceCheckProvider, statusText, usePriceCheck } from '../PriceCheckProvider';

const mockPages: Record<string, string | undefined> = {};

// The in-app browser: answers with the invented page text for the searched item.
jest.mock('react-native-webview', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
  const React = require('react');
  return {
    WebView: (props: {
      source: { uri: string };
      onMessage: (e: { nativeEvent: { data: string } }) => void;
      onError: () => void;
    }) => {
      React.useEffect(() => {
        const item = /keyword=(\d+)/.exec(props.source.uri)?.[1] ?? '';
        const text = mockPages[item];
        const t = setTimeout(() =>
          text === undefined ? props.onError() : props.onMessage({ nativeEvent: { data: text } }),
        );
        return () => clearTimeout(t);
      }, [props]);
      return null;
    },
  };
});

const page = (item: string, warehouse: string) =>
  `Item ${item}\nOnline Price\n$29.99\nWarehouse Price\n$\n${warehouse}`;

function Probe() {
  const { status, run } = usePriceCheck();
  return (
    <>
      <Text>{statusText(status) ?? 'idle'}</Text>
      <Pressable accessibilityRole="button" onPress={() => void run(true)}>
        <Text>Check again</Text>
      </Pressable>
    </>
  );
}

async function setup(due: string[]) {
  const server = fakeFetch({
    'POST /auth/refresh': () => ({ status: 200, body: TOKENS(1) }),
    'GET /price-checks/due': () => ({ status: 200, body: { item_numbers: due } }),
    'POST /price-checks': (body) => ({
      status: 200,
      body: {
        recorded: 1,
        flagged: (body as { results: { item_number: string }[] }).results.some(
          (r) => r.item_number === '2222222',
        )
          ? [
              {
                id: 'f1',
                purchase_id: 'p1',
                item_number: '2222222',
                description: 'EXAMPLE GADGET',
                refund_due_cents: 500,
                claim_deadline: '2026-10-20',
              },
            ]
          : [],
      },
    }),
    'POST /sync-runs': () => ({ status: 204 }),
  });
  await render(
    <AuthProvider
      baseUrl="https://api.example.test"
      tokens={memoryTokenStore('r0')}
      fetch={server.fetch}
    >
      <PriceCheckProvider pauseMs={0}>
        <Probe />
      </PriceCheckProvider>
    </AuthProvider>,
  );
  return server.calls;
}

beforeEach(() => {
  for (const k of Object.keys(mockPages)) delete mockPages[k];
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

test('checks due items on costco.com and announces a drop', async () => {
  mockPages['1111111'] = 'We were not able to find a match.';
  mockPages['2222222'] = page('2222222', '14.99');
  const calls = await setup(['1111111', '2222222']);
  expect(await screen.findByText('Checked 2 items on costco.com today.')).toBeTruthy();
  const report = calls.find((c) => c.path === '/price-checks');
  expect(report?.body).toMatchObject({
    results: [
      { item_number: '1111111', found: false },
      {
        item_number: '2222222',
        found: true,
        warehouse_price_cents: 1499,
        online_price_cents: 2999,
      },
    ],
  });
  expect(Alert.alert).toHaveBeenCalledWith('Price drop found', 'EXAMPLE GADGET: save $5.00');
});

test('runs once a day unless asked again', async () => {
  const calls = await setup([]);
  expect(await screen.findByText('Prices are up to date.')).toBeTruthy();
  const dueCalls = () => calls.filter((c) => c.path === '/price-checks/due').length;
  expect(dueCalls()).toBe(1);

  await act(async () => {
    (AppState as unknown as { emit?: (e: string, s: string) => void }).emit?.('change', 'active');
  });
  expect(dueCalls()).toBe(1);

  await fireEvent.press(screen.getByRole('button', { name: 'Check again' }));
  await waitFor(() => expect(dueCalls()).toBe(2));
});

test('a page that fails to load counts as a timeout', async () => {
  const calls = await setup(['3333333']);
  expect(
    await screen.findByText(/Checked 0 items|Prices are up to date|Couldn't reach/),
  ).toBeTruthy();
  expect(calls.some((c) => c.path === '/price-checks')).toBe(false);
});

test('status lines', () => {
  expect(statusText({ state: 'idle' })).toBeNull();
  expect(statusText({ state: 'running', done: 0, total: 3 })).toBe(
    'Checking costco.com prices… 1 of 3',
  );
  expect(statusText({ state: 'idle', last: { kind: 'done', checked: 1, flagged: [] } })).toBe(
    'Checked 1 item on costco.com today.',
  );
  expect(statusText({ state: 'idle', last: { kind: 'needWarehouse' } })).toMatch(/Choose your/);
  expect(statusText({ state: 'idle', last: { kind: 'blocked', checked: 0, flagged: [] } })).toMatch(
    /stopped/,
  );
  expect(statusText({ state: 'idle', last: { kind: 'failed' } })).toMatch(/Couldn't reach/);
});
