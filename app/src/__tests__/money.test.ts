import { formatCents } from '../money';

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
