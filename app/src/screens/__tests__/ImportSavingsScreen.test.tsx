import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Alert } from 'react-native';

import { fakeFetch, TOKENS } from '../../api/__fixtures__/fakeServer';
import { AuthProvider } from '../../auth/AuthContext';
import { memoryTokenStore } from '../../auth/tokenStore';
import { SAVINGS_SHOT_1, SAVINGS_SHOT_2 } from '../../parsing/__fixtures__/savingsScreenshots';
import type { OcrElement } from '../../parsing/types';
import { ImportSavingsScreen } from '../ImportSavingsScreen';

const mockState: { available: boolean; shots: OcrElement[][] } = { available: true, shots: [] };

jest.mock('../../config', () => ({ API_URL: 'https://api.example.test' }));
jest.mock('../../import/recognize', () => ({
  canRecognize: () => mockState.available,
  recognize: async (uri: string) => mockState.shots[Number(uri.replace('file:///shot', ''))],
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: async () => ({
    canceled: false,
    assets: mockState.shots.map((_s, i) => ({ uri: `file:///shot${i}` })),
  }),
}));

type Props = ComponentProps<typeof ImportSavingsScreen>;

async function setup() {
  const server = fakeFetch({
    'POST /auth/refresh': () => ({ status: 200, body: TOKENS(1) }),
    'POST /prices/batch': () => ({
      status: 201,
      body: {
        recorded: 6,
        duplicates: 0,
        flagged: [
          {
            id: 'f1',
            purchase_id: 'p1',
            item_number: '1100003',
            description: 'EXAMPLE SOUP STOCK',
            refund_due_cents: 200,
            claim_deadline: '2026-11-29',
          },
        ],
      },
    }),
  });
  const navigation = { goBack: jest.fn() };
  const props = { navigation, route: { key: 'k', name: 'ImportSavings' } } as unknown as Props;
  await render(
    <AuthProvider
      baseUrl="https://api.example.test"
      tokens={memoryTokenStore('r0')}
      fetch={server.fetch}
    >
      <ImportSavingsScreen {...props} />
    </AuthProvider>,
  );
  return { navigation, calls: server.calls };
}

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date(2026, 10, 24, 9, 0),
    doNotFake: ['nextTick', 'setImmediate'],
  });
  mockState.available = true;
  mockState.shots = [SAVINGS_SHOT_1, SAVINGS_SHOT_2];
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

test('explains the full build when text recognition is missing', async () => {
  mockState.available = false;
  await setup();
  expect(screen.getByText('Needs the full app build')).toBeTruthy();
});

test('reads screenshots, shows the offers and saves the prices', async () => {
  const { calls, navigation } = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Choose screenshots' }));
  expect(await screen.findByText('6 offers · seen Nov 23')).toBeTruthy();
  expect(screen.getByText('SAMPLE BRAND DARK CHOCOLATE 16 OZ')).toBeTruthy();
  expect(screen.getByText('EXAMPLE PARTY CUPS 140/18 OZ (#1100007)')).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Save 6 prices' }));
  const post = calls.find((c) => c.path === '/prices/batch');
  const prices = (post?.body as { prices: { item_number: string; seen_on: string }[] }).prices;
  expect(prices).toHaveLength(6);
  expect(prices[0]).toEqual({
    item_number: '1100001',
    channel: 'warehouse',
    price_cents: 1299,
    seen_on: '2026-11-23',
    promo_end: '2026-11-30',
    quantity_limit: 10,
  });

  const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
  expect(title).toBe('Warehouse Savings imported');
  expect(message).toContain('Saved 6 prices.');
  expect(message).toContain('EXAMPLE SOUP STOCK: get $2.00 back by Nov 29.');
  buttons[0].onPress();
  expect(navigation.goBack).toHaveBeenCalled();
});

test('says so when the screenshots are not a savings list', async () => {
  mockState.shots = [
    [{ text: 'Orders & Purchases', frame: { left: 40, top: 100, right: 400, bottom: 130 } }],
  ];
  await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Choose screenshots' }));
  expect(await screen.findByText(/No offers were found/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
});
