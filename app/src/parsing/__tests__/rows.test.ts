import { assembleRows } from '../rows';
import type { OcrElement } from '../types';

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe('assembleRows', () => {
  it('joins column pieces that sit on the same printed row, left to right', () => {
    const elements: OcrElement[] = [
      { text: '24.99 Y', frame: box(300, 101, 360, 119) },
      { text: '2222222', frame: box(40, 100, 110, 120) },
      { text: 'EXAMPLE GADGET', frame: box(130, 102, 280, 118) },
      { text: 'SUBTOTAL', frame: box(130, 140, 220, 160) },
      { text: '34.47', frame: box(300, 141, 360, 159) },
    ];
    expect(assembleRows(elements)).toEqual(['2222222 EXAMPLE GADGET 24.99 Y', 'SUBTOTAL 34.47']);
  });

  it('keeps rows that are close but not overlapping apart', () => {
    const elements: OcrElement[] = [
      { text: 'A', frame: box(0, 0, 10, 20) },
      { text: 'B', frame: box(0, 22, 10, 42) },
    ];
    expect(assembleRows(elements)).toEqual(['A', 'B']);
  });

  it('uses pieces without boxes as rows, in order', () => {
    expect(assembleRows([{ text: ' first  row ' }, { text: '' }, { text: 'second' }])).toEqual([
      'first row',
      'second',
    ]);
  });
});
