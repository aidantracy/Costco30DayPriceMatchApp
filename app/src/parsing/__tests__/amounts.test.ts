import { parseAmountCents } from '../amounts';

describe('parseAmountCents', () => {
  it.each([
    ['29.99', 2999],
    ['8.00-', -800],
    ['$23.80', 2380],
    ['0.05', 5],
  ])('parses %s', (text, cents) => {
    expect(parseAmountCents(text)).toBe(cents);
  });

  it.each(['29.9', 'abc', '1,234.00', ''])('rejects %p', (text) => {
    expect(parseAmountCents(text)).toBeNull();
  });
});
