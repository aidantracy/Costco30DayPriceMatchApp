/**
 * Recognized text from two invented screenshots of the Costco app's Warehouse Savings list,
 * laid out like a real phone screenshot (1080 px wide): a header with the warehouse name and
 * "Viewed on" date, product photos with their own printed text on the left, and the offer
 * text in a column on the right. The prices show the ways the superscript cents come out of
 * text recognition. The screenshots overlap by one offer, which is cut off at the bottom of
 * the first and at the top of the second. Every name, number and date is made up.
 */
import type { OcrElement } from '../types';

type Piece = [text: string, left: number, top: number, height?: number];

const el = ([text, left, top, height = 34]: Piece): OcrElement => ({
  text,
  frame: { left, top, right: left + Math.round(text.length * height * 0.5), bottom: top + height },
});

const COL = 380; // left edge of the offer text

/** The app's header, at the top of the first screenshot only (the list scrolls under it). */
const HEADER: Piece[] = [
  ['9:47', 40, 30, 40],
  ['Warehouse Savings', 270, 150, 50],
  ['Showing results for Sampletown', 44, 270],
  ['Viewed on Nov 23, 2026 at 09:47 PM', 44, 330],
  ['Sort', 870, 300],
  ['Select items available online, prices may vary', 44, 425],
  ['Appliances & Electronics', 66, 535],
  ['Automotive', 556, 535],
  ['See All Savings', 400, 685, 44],
];

export const SAVINGS_SHOT_1: OcrElement[] = [
  ...HEADER,
  // Photo text: a pack badge and a printed label.
  ['2', 64, 830, 30],
  ['PACK', 56, 866, 20],
  ['EXAMPLE', 90, 1480, 24],
  ['ORGANIC', 92, 1510, 24],
  // Superscript cents read as their own line.
  ['EXAMPLE KNIT HAT 2PK', COL, 830],
  ['Item 1100001', COL, 900, 30],
  ['$12', COL, 950, 56],
  ['99', COL + 92, 948, 28],
  ['After $4 OFF', COL, 1060],
  ['Valid Through Nov 30, 2026', COL, 1120, 30],
  ['In Stock', COL, 1185, 40],
  ['Sizes and colors may vary', COL, 1250, 30],
  ['Limit 10 per member', COL, 1300, 30],
  // Two-line name; cents run together with the dollars.
  ['SAMPLE BRAND DARK', COL, 1420],
  ['CHOCOLATE 16 OZ', COL, 1475],
  ['Item 1100002', COL, 1545, 30],
  ['$729', COL, 1600, 56],
  ['After $3.70 OFF', COL, 1710],
  ['Valid Through Dec 20, 2026', COL, 1770, 30],
  ['In Stock', COL, 1835, 40],
  ['Limit 5 per member', COL, 1900, 30],
  // No limit line.
  ['EXAMPLE SOUP STOCK 6/32 OZ', COL, 2020],
  ['Item 1100003', COL, 2090, 30],
  ['$7.79', COL, 2145, 56],
  ['After $2 OFF', COL, 2255],
  ['Valid Through Nov 29, 2026', COL, 2315, 30],
  ['In Stock', COL, 2380, 40],
  // Cut off at the bottom: no dates yet.
  ['SAMPLE PORCH LIGHT ^', COL, 2500],
  ['Item 1100004', COL, 2570, 30],
  ['$27 99', COL, 2625, 56],
].map((p) => el(p as Piece));

export const SAVINGS_SHOT_2: OcrElement[] = [
  // The porch light again, its name scrolled off the top.
  ['Item 1100004', COL, 40, 30],
  ['$27 99', COL, 95, 56],
  ['After $7 OFF', COL, 205],
  ['Valid Through Dec 20, 2026', COL, 265, 30],
  ['In Stock', COL, 330, 40],
  ['Limit 10 per member', COL, 395, 30],
  ['EXAMPLE', 70, 560, 26],
  ['MADELEINES 28 OZ', COL, 520],
  ['SAMPLE BAKERY', COL, 465],
  ['Item 1100005', COL, 590, 30],
  ['$6 79', COL, 645, 56],
  ['After $2 OFF', COL, 755],
  ['Valid Through Nov 30, 2026', COL, 815, 30],
  ['In Stock', COL, 880, 40],
  // A price over $1,000.
  ['EXAMPLE SECTIONAL SOFA', COL, 1000],
  ['Item 1100006', COL, 1070, 30],
  ['$1,299', COL, 1125, 56],
  ['99', COL + 190, 1123, 28],
  ['After $300 OFF', COL, 1235],
  ['Valid Through Dec 1, 2026', COL, 1295, 30],
  ['In Stock', COL, 1360, 40],
  // Cut off at the bottom of the last screenshot.
  ['EXAMPLE PARTY CUPS 140/18 OZ', COL, 1480],
  ['Item 1100007', COL, 1550, 30],
].map((p) => el(p as Piece));
