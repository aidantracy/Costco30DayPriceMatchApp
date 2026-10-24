# Spike S-1: Warehouse receipt structure

**Status:** Partly done · **Date:** Oct 23, 2026 · **Answers:** OQ-03 (in part), OQ-09 (preliminary)

## Method

The owner viewed a recent warehouse receipt in the Costco Android app (Account → Orders & Purchases → In-Warehouse → View Receipt) and shared screenshots in a private session. The layout below is described with **invented values**; no real receipt data, card digits, transaction numbers or locations are recorded here.

## What the receipts list shows

- Receipts appear "within 24 hours of the transaction", so sync must look back at least a day before treating a trip as missing (FR-03, NFR-17).
- The list defaults to the last 3 months and can be filtered. Each card shows the receipt type, date and time, warehouse name, and total.
- Receipt types seen: **In-Warehouse** and **Gas Station**. Gas station receipts are fuel only, which the price adjustment policy doesn't cover, so the importer skips them.

## Receipt layout (invented example)

```text
                SAMPLE #999
          100 EXAMPLE WAY
          SAMPLE CITY, ST 00000
    ||||||||||||||||||||||||||||||||
       21099900201232610011030
E       1111111   KS EXAMPLE A         4.99 Y
        2222222   EXAMPLE GADGET      24.99 Y
        3333333   / 2222222            5.00-
E       4444444   EXAMPLE SNACK        9.49 Y
                  SUBTOTAL            34.47
                  TAX                  2.07
             **** TOTAL               36.54
XXXXXXXXXXXX0000                  CHIP read
APPROVED - PURCHASE
...
INSTANT SAVINGS                        $5.00
TOTAL NUMBER OF ITEMS SOLD = 3
  Whse: 999  Trm: 2  Trn: 123  OPT: 45
Items Sold: 3
```

## Findings

| Element | Format | How the parser uses it |
| --- | --- | --- |
| Warehouse | Name and number in the header (`SAMPLE #999`), and `Whse:` in the footer | `warehouse_id` for the claim card and BR-4 |
| Barcode number | 23 digits: `21` + warehouse (4) + terminal (3) + transaction (4) + date `YYMMDD` + time `HHMM` | Cross-checks the footer; forms the receipt identifier |
| Receipt identifier | Warehouse + terminal + transaction + date | `receipt_id` in the duplicate key (FR-08) |
| Item line | Optional one-letter code, item number (6 to 7 digits), abbreviated description, line price, trailing tax flag | One purchase per item line (FR-04). The leading code's meaning is unknown and not needed |
| Discount line | Its own number, then `/ <item number>` pointing at the item it discounts, and an amount with a trailing minus (`5.00-`) | Subtracted from that item's price paid, not imported as a purchase (FR-05). The example item's price paid is 19.99 |
| Totals | `SUBTOTAL`, `TAX`, `TOTAL`, `INSTANT SAVINGS`, `Items Sold` | Used to check the parse (below) |
| Payment block | Masked card number, approval, amount, card brand | Discarded entirely (NFR-03) |
| Date and time | In the footer and the barcode, local time of the warehouse | `purchase_date` in the warehouse's time zone (OQ-04) |

### Parse checks

The receipt carries enough totals for the parser to prove it read every line. A parse is accepted only if all three hold; otherwise the receipt goes to the review queue (FR-09, NFR-15):

1. The number of item lines (excluding discount lines) equals `Items Sold`.
2. The sum of item lines minus discount lines equals `SUBTOTAL`.
3. The sum of discount lines equals `INSTANT SAVINGS`.

All three held on the real receipt inspected.

### Still unknown

- **Quantities above one:** every line on the inspected receipt was a single unit. A receipt with a multi-unit line is needed to see how quantity and unit price are printed.
- **Returns and voided lines** on a receipt.
- **costco.com structure:** this spike used the Costco app. The in-app browser reads costco.com, so its Orders & Purchases page still has to be inspected to see whether receipts load as HTML or as JSON, and whether the fields match.

## S-3: Sharing from the Costco app

On Android, the receipt view shows the receipt and a **Close** button, with no visible share or download option. If that holds on iOS too, the shared-PDF fallback (US-IMP-03) can't work as designed, and the fallbacks are manual entry and, in Phase 2, receipt photos with OCR. To confirm:

- check the receipt screen's top bar and any long-press menu for a share option;
- check the same receipt on costco.com in a browser, which may offer print or download.

## Next steps

1. Inspect the costco.com Orders & Purchases page in the in-app browser with the owner signed in, and record its structure here.
2. Find a receipt with a multi-unit line.
3. Build the invented fixture set (normal, discounted, multi-unit, malformed) for the parser tests.
