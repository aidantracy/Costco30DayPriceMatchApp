import { readProductPage } from '../extract';

// Invented product pages laid out like costco.com's text (spike S-2).
const PRODUCT = [
  'My Warehouse',
  'Sample Town',
  'Open',
  'Example Chicken Broth, 32 oz, 6-count',
  'Item 1234567',
  '2-Day Delivery',
  'Online Price',
  '$9.99',
  '$2.50',
  ' OFF',
  'was',
  '$',
  '12.49',
  "$2.50 manufacturer's savings is valid 10/19/26 through 11/15/26. While supplies last.",
  'In-Warehouse',
  'Warehouse Price',
  '$',
  '7.49',
].join('\n');

test('reads the warehouse and online prices and the savings end date', () => {
  expect(readProductPage(PRODUCT, '1234567')).toEqual({
    kind: 'found',
    itemNumber: '1234567',
    warehousePriceCents: 749,
    onlinePriceCents: 999,
    promoEnd: '2026-11-15',
  });
});

test('reads prices split across lines and with thousands separators', () => {
  const page = 'Item 7654321\nOnline Price\n$1,299\n.\n99\nWarehouse Price\n$\n1,199.99';
  expect(readProductPage(page, '7654321')).toMatchObject({
    warehousePriceCents: 119999,
    onlinePriceCents: 129999,
    promoEnd: null,
  });
});

test('uses "Price valid through" when there are no savings dates', () => {
  const page = 'Item 1234567\nOnline Price\n$699.99\nPrice valid through 11/5/2026';
  expect(readProductPage(page, '1234567')).toMatchObject({
    warehousePriceCents: null,
    onlinePriceCents: 69999,
    promoEnd: '2026-11-05',
  });
});

test.each([
  ["We're sorry. We were not able to find a match.", 'notFound'],
  ["Access Denied\nYou don't have permission to access this page.", 'challenge'],
  ['Pardon Our Interruption', 'challenge'],
  ['Loading…', 'unreadable'],
  ['Item 1234567\nNo prices here', 'unreadable'],
])('%p → %s', (page, kind) => {
  expect(readProductPage(page, '1234567').kind).toBe(kind);
});

test('a different product than the one searched for counts as not found', () => {
  expect(readProductPage(PRODUCT, '1111111').kind).toBe('notFound');
});

test('asks for a warehouse when none is chosen', () => {
  const page = 'My Warehouse\nSet My Warehouse\nItem 1234567\nOnline Price\n$9.99';
  expect(readProductPage(page, '1234567').kind).toBe('needWarehouse');
});
