import { formatCents, parseDollars } from '../money';

describe('formatCents', () => {
  it('formats whole and fractional dollars', () => {
    expect(formatCents(1999)).toBe('$19.99');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(123456)).toBe('$1,234.56');
  });

  it('formats negative amounts', () => {
    expect(formatCents(-500)).toBe('-$5.00');
  });

  it('rejects fractional cents', () => {
    expect(() => formatCents(1.5)).toThrow(TypeError);
  });
});

describe('parseDollars', () => {
  test.each([
    ['18.99', 1899],
    ['$1,299', 129900],
    [' 4.5 ', 450],
    ['0', 0],
    ['.99', 99],
    ['12.', 1200],
  ])('%s → %s cents', (input, cents) => {
    expect(parseDollars(input)).toBe(cents);
  });

  test.each(['', 'abc', '-1', '1.999', '1.2.3', '$', '9'.repeat(20)])('rejects %p', (input) => {
    expect(parseDollars(input)).toBeNull();
  });
});
