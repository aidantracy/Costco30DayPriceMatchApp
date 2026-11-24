import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Alert } from 'react-native';

import { fakeFetch, TOKENS } from '../../api/__fixtures__/fakeServer';
import { AuthProvider } from '../../auth/AuthContext';
import { memoryTokenStore } from '../../auth/tokenStore';
import { SAVINGS_PAGE_1, SAVINGS_PAGE_2 } from '../../parsing/__fixtures__/savingsScreens';
import type { ReaderStatus } from '../../prices/savingsReader';
import { ReadSavingsScreen } from '../ReadSavingsScreen';

const idle: ReaderStatus = { state: 'idle', step: '', error: '', pages: [] };

const mockReader = {
  available: true,
  enabled: true,
  installed: true,
  status: idle as ReaderStatus,
  start: jest.fn(),
  cancel: jest.fn(),
  clear: jest.fn(),
  openSettings: jest.fn(),
};

const mockSchedule = jest.fn();

jest.mock('../../config', () => ({ API_URL: 'https://api.example.test' }));
jest.mock('../../prices/savingsReminder', () => ({
  scheduleSavingsReminder: (ends: string[]) => mockSchedule(ends),
}));
jest.mock('../../prices/savingsReader', () => ({
  canRead: () => mockReader.available,
  savingsReader: {
    isServiceEnabled: () => mockReader.enabled,
    isCostcoInstalled: () => mockReader.installed,
    openSettings: () => mockReader.openSettings(),
    start: () => {
      mockReader.start();
      if (!mockReader.installed) return false;
      mockReader.status = { state: 'running', step: 'finding', error: '', pages: [] };
      return true;
    },
    cancel: () => {
      mockReader.cancel();
      mockReader.status = { ...mockReader.status, state: 'cancelled' };
    },
    clear: () => mockReader.clear(),
    status: () => mockReader.status,
  },
}));

type Props = ComponentProps<typeof ReadSavingsScreen>;

async function setup(params?: { autoStart?: boolean }) {
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
  const navigation = { goBack: jest.fn(), setParams: jest.fn() };
  const props = {
    navigation,
    route: { key: 'k', name: 'ReadSavings', params },
  } as unknown as Props;
  await render(
    <AuthProvider
      baseUrl="https://api.example.test"
      tokens={memoryTokenStore('r0')}
      fetch={server.fetch}
    >
      <ReadSavingsScreen {...props} />
    </AuthProvider>,
  );
  return { navigation, calls: server.calls };
}

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react');
    useEffect(cb, [cb]);
  },
}));

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 10, 24, 9, 0) });
  Object.assign(mockReader, { available: true, enabled: true, installed: true, status: idle });
  jest.clearAllMocks();
  mockSchedule.mockResolvedValue(new Date(2026, 10, 30, 10));
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

test('explains a build without the reader', async () => {
  mockReader.available = false;
  await setup();
  expect(screen.getByText('Needs the latest app build')).toBeTruthy();
});

test('asks for the accessibility permission first', async () => {
  mockReader.enabled = false;
  await setup();
  expect(screen.getByText('Let the app read Warehouse Savings')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
  expect(mockReader.openSettings).toHaveBeenCalled();
});

test('says so when the Costco app is missing', async () => {
  mockReader.installed = false;
  await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Read Warehouse Savings' }));
  expect(screen.getByText("The Costco app isn't installed on this phone.")).toBeTruthy();
});

test('reads the list, shows the offers and saves the prices', async () => {
  const { calls, navigation } = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Read Warehouse Savings' }));
  expect(screen.getByText('Opening Warehouse Savings…')).toBeTruthy();

  mockReader.status = {
    state: 'done',
    step: 'reading',
    error: '',
    pages: [SAVINGS_PAGE_1, SAVINGS_PAGE_2],
  };
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(screen.getByText('6 offers · seen Nov 23')).toBeTruthy();
  expect(screen.getByText('SAMPLE BRAND DARK CHOCOLATE 16 OZ')).toBeTruthy();
  expect(screen.getByText('EXAMPLE PARTY CUPS 140/18 OZ (#1100007)')).toBeTruthy();

  // The save button is at the top and the bottom of the list.
  expect(screen.getAllByRole('button', { name: 'Save 6 prices' })).toHaveLength(2);

  jest.useRealTimers();
  await fireEvent.press(screen.getAllByRole('button', { name: 'Save 6 prices' })[0]);
  const post = calls.find((c) => c.path === '/prices/batch');
  const prices = (post?.body as { prices: unknown[] }).prices;
  expect(prices).toHaveLength(6);
  expect(prices[0]).toEqual({
    item_number: '1100001',
    channel: 'warehouse',
    price_cents: 1299,
    seen_on: '2026-11-23',
    promo_end: '2026-11-30',
    quantity_limit: 10,
  });
  expect(mockReader.clear).toHaveBeenCalled();
  const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
  expect(title).toBe('Warehouse Savings saved');
  expect(message).toContain('EXAMPLE SOUP STOCK: get $2.00 back by Nov 29.');
  expect(message).toContain('Reminder set for Nov 30 to read it again.');
  expect(mockSchedule).toHaveBeenCalledWith(expect.arrayContaining(['2026-11-30', '2026-12-20']));
  buttons[0].onPress();
  expect(navigation.goBack).toHaveBeenCalled();
});

test('can be stopped while reading', async () => {
  await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Read Warehouse Savings' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
  expect(mockReader.cancel).toHaveBeenCalled();
  expect(screen.getByText('Stopped.')).toBeTruthy();
});

test('shows what it saw when no offers were found', async () => {
  mockReader.status = {
    state: 'done',
    step: 'reading',
    error: '',
    pages: [[{ text: 'Gas Prices', frame: { left: 40, top: 100, right: 300, bottom: 130 } }]],
  };
  await setup();
  expect(screen.getByText(/No offers were found/)).toBeTruthy();
  expect(screen.getByText('Gas Prices')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
});

test('shows why a reading failed', async () => {
  mockReader.status = {
    state: 'failed',
    step: 'finding',
    error: "Couldn't find Warehouse Savings in the Costco app.",
    pages: [],
  };
  await setup();
  expect(screen.getByText("Couldn't find Warehouse Savings in the Costco app.")).toBeTruthy();
});

test('starts reading right away when opened from the reminder', async () => {
  const { navigation } = await setup({ autoStart: true });
  expect(mockReader.start).toHaveBeenCalledTimes(1);
  expect(navigation.setParams).toHaveBeenCalledWith({ autoStart: undefined });
  expect(screen.getByText('Opening Warehouse Savings…')).toBeTruthy();
});

test('saves without a reminder when notifications are off', async () => {
  mockSchedule.mockResolvedValue(null);
  mockReader.status = { state: 'done', step: 'reading', error: '', pages: [SAVINGS_PAGE_1] };
  jest.useRealTimers();
  await setup();
  await fireEvent.press(screen.getAllByRole('button', { name: /^Save/ })[0]);
  const [, message] = (Alert.alert as jest.Mock).mock.calls[0];
  expect(message).not.toContain('Reminder');
});
