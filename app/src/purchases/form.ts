import type { Channel, ManualPurchaseIn } from '../api/types';
import { isIsoDate } from '../dates';
import { parseDollars } from '../money';

/** What the Add purchase screen holds while someone types. All text, like the inputs. */
export interface PurchaseForm {
  channel: Channel;
  itemNumber: string;
  description: string;
  quantity: string;
  price: string;
  purchaseDate: string;
  warehouseNumber: string;
}

export type FormErrors = Partial<Record<keyof PurchaseForm, string>>;

export function emptyForm(today: string): PurchaseForm {
  return {
    channel: 'warehouse',
    itemNumber: '',
    description: '',
    quantity: '1',
    price: '',
    purchaseDate: today,
    warehouseNumber: '',
  };
}

/**
 * Checks the form with the same limits the API enforces, so most mistakes are caught before
 * sending. Returns the request body when valid, otherwise a message per field.
 */
export function validatePurchase(
  form: PurchaseForm,
  today: string,
): { ok: true; body: ManualPurchaseIn } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  const itemNumber = form.itemNumber.trim();
  const description = form.description.trim();
  const warehouse = form.warehouseNumber.trim();

  if (!/^\d{3,9}$/.test(itemNumber)) {
    errors.itemNumber = 'Item number is 3 to 9 digits (on the receipt or product page).';
  }
  if (description.length === 0) errors.description = 'Add a short description.';
  else if (description.length > 200) errors.description = 'Keep it under 200 characters.';

  const quantity = Number(form.quantity.trim());
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    errors.quantity = 'Quantity is a whole number from 1 to 999.';
  }

  const cents = parseDollars(form.price);
  if (cents === null) errors.price = 'Enter the price paid per item, like 18.99.';
  else if (cents > 10_000_000) errors.price = 'That price is too high.';

  if (!isIsoDate(form.purchaseDate.trim())) {
    errors.purchaseDate = 'Use the format YYYY-MM-DD.';
  } else if (form.purchaseDate.trim() > today) {
    errors.purchaseDate = "The purchase date can't be in the future.";
  }

  if (form.channel === 'warehouse' && !/^\d{1,4}$/.test(warehouse)) {
    errors.warehouseNumber = 'Warehouse number is 1 to 4 digits (top of the receipt).';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      channel: form.channel,
      item_number: itemNumber,
      description,
      quantity,
      unit_price_cents: cents as number,
      purchase_date: form.purchaseDate.trim(),
      ...(form.channel === 'warehouse' ? { warehouse_number: warehouse } : {}),
    },
  };
}
