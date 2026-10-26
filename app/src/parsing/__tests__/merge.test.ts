import { mergeScreenshots } from '../merge';
import { SCREENSHOT_1, SCREENSHOT_2, SIMPLE_RECEIPT } from '../__fixtures__/receipts';

describe('mergeScreenshots', () => {
  it('removes rows repeated where the receipt was scrolled', () => {
    expect(mergeScreenshots([SCREENSHOT_1, SCREENSHOT_2])).toEqual(SIMPLE_RECEIPT);
  });

  it('appends screenshots with no overlap', () => {
    expect(mergeScreenshots([['a', 'b'], ['c', 'd']])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not merge a single repeated row, which may be a second identical purchase', () => {
    expect(mergeScreenshots([['x', 'same item 1.00'], ['same item 1.00', 'y']])).toEqual([
      'x',
      'same item 1.00',
      'same item 1.00',
      'y',
    ]);
  });
});
