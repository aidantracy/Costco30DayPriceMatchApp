/**
 * Recognized text from two invented screenshots of a receipt in the Costco app, with the
 * geometry seen on a real phone: the phone's status bar and the app's header and tab bar in
 * every screenshot, a two-pack printed as "2 @" with its description wrapped onto two lines
 * and the item number between them, a price wrapped above its tax flag, a discount that
 * names a related item number, and the footer printed as labels over values. Every value is
 * made up.
 */
import type { OcrElement } from '../types';

type Piece = [text: string, left: number, top: number];

const H = 16; // text height in pixels
const el = ([text, left, top]: Piece): OcrElement => ({
  text,
  frame: { left, top, right: left + text.length * 9, bottom: top + H },
});

function row(top: number, ...cols: [string, number][]): Piece[] {
  return cols.map(([text, left]) => [text, left, top]);
}

// Receipt body, positioned in "receipt space"; each screenshot shows a window of it.
const BODY: Piece[] = [
  ...row(0, ['SAMPLE #999', 160]),
  ...row(22, ['100 EXAMPLE WAY', 120]),
  ...row(44, ['SAMPLE CITY, ST 00000', 120]),
  ...row(100, ['21099900301232610311143', 110]),
  ...row(132, ['1111111', 140], ['KS EXAMPLE A', 220], ['4.99 Y', 360]),
  ...row(164, ['2222222', 140], ['EXAMPLE GADGET', 220], ['19.99 Y', 360]),
  ...row(196, ['3333333', 140], ['/ 2222222', 220], ['4.00-', 370]),
  ...row(228, ['E', 60], ['4444444', 140], ['EXAMPLE SNACK', 220], ['9.49 Y', 360]),
  ...row(260, ['2 @ 8.49', 70]),
  // Two-pack: description on two lines, item number between them, price above its flag.
  ...row(292, ['EXAMPLE', 220], ['16.98', 370]),
  ...row(303, ['5555555', 140]),
  ...row(314, ['TWIN PK', 220], ['Y', 410]),
  ...row(346, ['6666666', 140], ['/5555599', 220], ['3.00-', 370]),
  // Price wrapped above its tax flag, description on one line between them.
  ...row(378, ['29.99', 370]),
  ...row(388, ['7777777', 140], ['EXAMPLE DIAPER', 220]),
  ...row(400, ['Y', 410]),
  ...row(432, ['8888888', 140], ['/ 7777777', 220], ['5.00-', 370]),
  ...row(464, ['SUBTOTAL', 220], ['69.44', 370]),
  ...row(496, ['TAX', 220], ['4.17', 370]),
  ...row(528, ['****', 160], ['TOTAL', 220], ['73.61', 370]),
  ...row(590, ['XXXXXXXXXXXX0000', 60], ['CHIP', 380]),
  ...row(612, ['read', 390]),
  ...row(644, ['APPROVED - PURCHASE', 60]),
  ...row(676, ['AMOUNT: $73.61', 60]),
  ...row(708, ['10/31/2026', 60], ['11:43', 170], ['999 3 123 45', 230]),
  ...row(740, ['VISA', 60], ['73.61', 370]),
  ...row(772, ['CHANGE', 60], ['0', 400]),
  ...row(834, ['(A) A', 140], ['4.17', 370]),
  ...row(866, ['TOTAL TAX', 140], ['4.17', 370]),
  ...row(898, ['TOTAL NUMBER OF ITEMS SOLD = 6', 60]),
  ...row(930, ['INSTANT SAVINGS', 60], ['$12.00', 360]),
  ...row(962, ['10/31/2026', 60], ['11:43', 170], ['999 3 123 45', 230]),
  ...row(1024, ['Thank You!', 190]),
  ...row(1056, ['Please Come Again', 170]),
  ...row(1100, ['Whse:', 70], ['Trm:', 180], ['Trn:', 280], ['OPT:', 380]),
  ...row(1122, ['999', 70], ['3', 180], ['123', 280], ['45', 380]),
];

const STATUS_BAR: Piece[] = [['10:24 G ao', 10, 8]];
const HEADER: Piece[] = [
  ['Orders & Purchases', 150, 70],
  ['at Sample | Delivering to 00000', 40, 130],
  ['In-Warehouse Receipt', 50, 230],
  ['Print Receipt', 300, 280],
];
const TAB_BAR = (top: number): Piece[] => [
  ['Explore', 20, top],
  ['Shop', 120, top],
  ['Account', 220, top],
  ['Warehouse', 320, top],
  ['Cart', 430, top],
];

const SCREEN_HEIGHT = 1100;
const BODY_TOP = 340; // where the receipt starts in the first screenshot

/** One screenshot: receipt scrolled by `scroll` pixels, framed by the phone and app. */
function screenshot(scroll: number, withHeader: boolean): OcrElement[] {
  const top = withHeader ? BODY_TOP : 170;
  const visible = BODY.filter(
    ([, , y]) => y - scroll + top >= top && y - scroll + top < SCREEN_HEIGHT - 60,
  ).map(([t, x, y]): Piece => [t, x, y - scroll + top]);
  return [
    ...STATUS_BAR,
    ...(withHeader ? HEADER : [['Orders & Purchases', 150, 70] as Piece]),
    ...visible,
    ...TAB_BAR(SCREEN_HEIGHT - 40),
  ].map(el);
}

/** Top of the receipt through the diaper line. */
export const APP_SHOT_1 = screenshot(0, true);
/** Overlaps the first from the snack line down to the footer. */
export const APP_SHOT_2 = screenshot(220, false);
/** One tall scrolling screenshot of the whole receipt. */
export const APP_SHOT_TALL = BODY.map(([t, x, y]): Piece => [t, x, y + 200]).map(el);
