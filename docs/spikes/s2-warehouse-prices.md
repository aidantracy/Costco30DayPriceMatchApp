# Spike S-2: Warehouse prices and item numbers on costco.com

**Status:** Partly done · **Date:** Nov 11, 2026 · **Supports:** ADR 0004, FR-16 to FR-18

## Questions

1. Is the in-warehouse price public, and is it warehouse-specific?
2. Do costco.com item numbers match the numbers printed on warehouse receipts?
3. How many warehouse purchases can be checked on costco.com at all?
4. Can a server on Google Cloud read the pages, or does bot protection block it?

## Method

Public costco.com pages were read in a desktop browser with a home warehouse selected, using item numbers from one real receipt. Only page structure and match counts are recorded here; the receipt and the warehouse stay private.

## Findings

| Question | Answer |
| --- | --- |
| Warehouse price public? | **Yes.** Product pages show a **Warehouse Price** for the selected warehouse next to the **Online Price**, plus the instant-savings text with its dates, e.g. "$2.50 manufacturer's savings is valid 10/19/26 through 11/15/26". The warehouse price appears to already include current instant savings. |
| Warehouse-specific? | **Yes.** The page is rendered for the warehouse in the browser's cookies (`STORELOCATION`, `C_WHLOC`, `WAREHOUSEDELIVERY_WHS`). There's no separate price API call; the price is in the server-rendered HTML. |
| Item numbers match? | **Yes, when the item is online.** Searching `/s?keyword=<item number>` redirects (in the browser) straight to the product page, whose "Item N" equals the receipt number. The warehouse price shown matched the receipt's printed price. |
| Coverage | **Low for groceries and household goods: 1 of 4** sampled receipt items is sold online. The other three return "We were not able to find a match", with Costco's own note that many warehouse items aren't online and that the Costco app searches warehouse inventory. |
| Search listing (`keyword=OFF`, `buyInWarehouse=true`) | Shows **online** prices and "$X OFF" amounts only, not warehouse prices. Useful for finding items on sale, not for pricing. |
| Server access | **Not yet known.** Every page loads Akamai bot-management scripts. The build container can't reach costco.com at all, so this has to be tested from Google Cloud Shell, which uses the same kind of addresses as Cloud Run. |

## What this means for the price check

- **Items sold online (automatic):** the daily job (ADR 0004) can request the product page for each open purchase's item number with the owner's warehouse set. It records the Warehouse Price and the promo end date as an automatic observation, and the existing flagging rules do the rest. An item that isn't found is marked "not online" and retried weekly, not daily (NFR-21).
- **Warehouse-only items (most groceries):** costco.com can't price them. The source that does cover them is the Costco app's **Warehouse Savings** list. Options, in order of effort:
  1. Import screenshots of the Warehouse Savings list with the same on-device text recognition as receipts.
  2. Read the list automatically inside the Costco app on the phone, together with receipt sync (later; personal use only).
- If Cloud Shell shows the pages are blocked from Google Cloud, the costco.com check moves to the phone (residential connection), run when the app opens and as a background task.

## Still to check

1. **From Cloud Shell:** fetch a public product page and record the HTTP status and whether the "Warehouse Price" text is present.
2. **Owner, in the Costco app:** whether Warehouse Savings entries show item numbers, dates and dollar amounts.
3. Larger sample for coverage (non-grocery purchases are more likely to be online).
