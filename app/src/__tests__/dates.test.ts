import { daysLeftLabel, isIsoDate, shortDate, todayIso } from '../dates';

test('todayIso uses local calendar parts', () => {
  expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
});

test.each([
  ['2026-10-03', true],
  ['2024-02-29', true],
  ['2026-02-29', false],
  ['2026-13-01', false],
  ['2026-1-01', false],
  ['10/03/2026', false],
])('isIsoDate(%s) is %s', (value, expected) => {
  expect(isIsoDate(value)).toBe(expected);
});

test('shortDate', () => {
  expect(shortDate('2026-10-03')).toBe('Oct 3');
  expect(shortDate('2026-01-31')).toBe('Jan 31');
});

test.each([
  [-1, 'Window closed'],
  [0, 'Last day today'],
  [1, '1 day left'],
  [12, '12 days left'],
])('daysLeftLabel(%s)', (days, label) => {
  expect(daysLeftLabel(days)).toBe(label);
});
