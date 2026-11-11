import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Alert } from 'react-native';

import { fakeFetch, TOKENS } from '../../api/__fixtures__/fakeServer';
import { AuthProvider } from '../../auth/AuthContext';
import { memoryTokenStore } from '../../auth/tokenStore';
import { MISREAD_RECEIPT, SIMPLE_RECEIPT } from '../../parsing/__fixtures__/receipts';
import { ImportReceiptScreen } from '../ImportReceiptScreen';

const mockState: { available: boolean; shots: string[][] } = { available: true, shots: [] };

jest.mock('../../config', () => ({ API_URL: 'https://api.example.test' }));
jest.mock('../../import/recognize', () => ({
  canRecognize: () => mockState.available,
  recognize: async (uri: string) =>
    mockState.shots[Number(uri.replace('file:///shot', ''))].map((text) => ({ text })),
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: async () => ({
    canceled: false,
    assets: mockState.shots.map((_s, i) => ({ uri: `file:///shot${i}` })),
  }),
}));

type Props = ComponentProps<typeof ImportReceiptScreen>;

async function setup() {
  const server = fakeFetch({
    'POST /auth/refresh': () => ({ status: 200, body: TOKENS(1) }),
    'POST /purchases/batch': () => ({
      status: 200,
      body: {
        created: 3,
        duplicates: 0,
        already_cheaper: [
          {
            id: 'f1',
            purchase_id: 'p1',
            item_number: '2222222',
            description: 'EXAMPLE GADGET',
            refund_due_cents: 300,
            claim_deadline: '2026-10-31',
          },
        ],
      },
    }),
    'POST /review-items': () => ({ status: 201, body: {} }),
  });
  const navigation = { replace: jest.fn(), goBack: jest.fn() };
  const props = { navigation, route: { key: 'k', name: 'ImportReceipt' } } as unknown as Props;
  await render(
    <AuthProvider baseUrl="https://api.example.test" tokens={memoryTokenStore('r0')} fetch={server.fetch}>
      <ImportReceiptScreen {...props} />
    </AuthProvider>,
  );
  return { navigation, calls: server.calls };
}

beforeEach(() => {
  mockState.available = true;
  mockState.shots = [SIMPLE_RECEIPT];
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

test('explains the development build when text recognition is missing', async () => {
  mockState.available = false;
  const { navigation } = await setup();
  expect(screen.getByText('Needs the full app build')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Add by hand' }));
  expect(navigation.replace).toHaveBeenCalledWith('AddPurchase');
});

test('reads screenshots, shows the review and imports the receipt', async () => {
  mockState.shots = [SIMPLE_RECEIPT.slice(0, 8), SIMPLE_RECEIPT.slice(4)];
  const { calls } = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Choose screenshots' }));
  expect(await screen.findByText('Warehouse #999 · Oct 1')).toBeTruthy();
  expect(screen.getByText('Everything adds up.')).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Save 3 items' }));
  const batch = calls.find((c) => c.path === '/purchases/batch');
  expect(batch?.body).toMatchObject({ source: 'screenshot', receipts: [{ receipt_id: '999-2-123-2026-10-01' }] });
  expect(Alert.alert).toHaveBeenCalledWith(
    'Receipt imported',
    'Added 3 items.\nEXAMPLE GADGET is already cheaper: save $3.00 by Oct 31.',
    expect.any(Array),
  );
});

test('a misread price can be corrected before saving', async () => {
  mockState.shots = [MISREAD_RECEIPT];
  await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Choose screenshots' }));
  expect(await screen.findByText(/subtotal is \$34.47/)).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: 'Save 3 items' }));
  expect(Alert.alert).toHaveBeenCalledWith("Totals don't match", expect.any(String), expect.any(Array));

  await fireEvent.press(screen.getByText('KS EXAMPLE A'));
  await fireEvent.changeText(screen.getByLabelText('Printed price'), '4.99');
  await fireEvent.press(screen.getByRole('button', { name: 'Update price' }));
  expect(await screen.findByText('Everything adds up.')).toBeTruthy();
});

test('giving up reports the reason and opens manual entry', async () => {
  mockState.shots = [SIMPLE_RECEIPT.slice(0, 8).filter((r) => !/^\d{20,}$/.test(r))];
  const { navigation, calls } = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Choose screenshots' }));
  expect(await screen.findByText(/Couldn't find the receipt number/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: "Can't fix it, add by hand" }));
  expect(calls.find((c) => c.path === '/review-items')?.body).toMatchObject({ source: 'screenshot' });
  expect(navigation.replace).toHaveBeenCalledWith('AddPurchase');
});
