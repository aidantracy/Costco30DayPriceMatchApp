import { emptyForm, validatePurchase, type PurchaseForm } from '../form';

const TODAY = '2026-10-10';
const valid = (overrides: Partial<PurchaseForm> = {}): PurchaseForm => ({
  ...emptyForm(TODAY),
  itemNumber: ' 1234567 ',
  description: ' KS EXAMPLE WATER ',
  quantity: '2',
  price: '$18.99',
  warehouseNumber: '999',
  ...overrides,
});

test('a valid warehouse purchase becomes the API body', () => {
  expect(validatePurchase(valid(), TODAY)).toEqual({
    ok: true,
    body: {
      channel: 'warehouse',
      item_number: '1234567',
      description: 'KS EXAMPLE WATER',
      quantity: 2,
      unit_price_cents: 1899,
      purchase_date: TODAY,
      warehouse_number: '999',
    },
  });
});

test('online purchases drop the warehouse number', () => {
  const result = validatePurchase(valid({ channel: 'online', warehouseNumber: '' }), TODAY);
  expect(result.ok && result.body).not.toHaveProperty('warehouse_number');
});

test('every field is checked', () => {
  const result = validatePurchase(
    {
      channel: 'warehouse',
      itemNumber: '12',
      description: '   ',
      quantity: '0',
      price: 'free',
      purchaseDate: '2026-02-30',
      warehouseNumber: 'abc',
    },
    TODAY,
  );
  expect(result.ok).toBe(false);
  expect(!result.ok && Object.keys(result.errors).sort()).toEqual(
    ['description', 'itemNumber', 'price', 'purchaseDate', 'quantity', 'warehouseNumber'].sort(),
  );
});

test.each([
  [{ description: 'x'.repeat(201) }, 'description'],
  [{ quantity: '1000' }, 'quantity'],
  [{ quantity: '1.5' }, 'quantity'],
  [{ price: '100001' }, 'price'],
  [{ purchaseDate: '2026-10-11' }, 'purchaseDate'],
])('%p is rejected on %s', (overrides, field) => {
  const result = validatePurchase(valid(overrides), TODAY);
  expect(!result.ok && Object.keys(result.errors)).toEqual([field]);
});
