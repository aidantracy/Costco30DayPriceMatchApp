# ADR 0008: Read Warehouse Savings from the Costco app with an accessibility service

**Status:** Accepted · **Date:** Nov 23, 2026 · **Informed by:** spike S-2

## Context

ADR 0007 checks prices on costco.com, which only covers items sold online. Most groceries are warehouse-only: their item numbers return "not able to find a match" on costco.com, and the savings listing there (`keyword=OFF&refinement=buyInWarehouse=true`) doesn't include them either. The Costco app's **Warehouse → Warehouse Savings** list does, for the member's warehouse, with the item number, the price after savings, the amount off, the end date and the quantity limit.

The owner wants this read automatically, not by taking and importing screenshots.

Options considered:

1. **Screenshot import** with on-device text recognition (like ADR 0006). Works, but needs many screenshots each time.
2. **Call the Costco app's own API.** Most automatic, but it means intercepting the app's traffic (likely blocked by certificate pinning), may need app keys that can't go in a public repo, and is the furthest from personal, user-driven use.
3. **An Android accessibility service** that reads the Costco app's screen while it scrolls Warehouse Savings.

## Decision

Option 3. The in-repo module `modules/costco-savings` adds an accessibility service limited to the Costco app's package (`android:packageNames`). When the owner taps **Read Warehouse Savings**:

1. The app opens the Costco app and marks a reading as started (it expires after 3 minutes).
2. The service taps Warehouse, then Warehouse Savings, if it can find them; otherwise it asks the owner to open them.
3. On the list, it records the visible text and positions, scrolls, and repeats until the list stops changing or can't scroll, then returns to the app.
4. The app parses the pages on the phone (`parsing/warehouseSavings.ts`), shows the offers, and on confirmation sends only item numbers, prices, dates and limits to `POST /prices/batch`.

The service ignores all events unless a reading is running. Nothing it reads is stored or sent except the parsed prices; the warehouse name in the list header is never parsed.

## Consequences

- One tap instead of screenshots, and exact text instead of text recognition.
- The owner turns the service on once in Android's accessibility settings. On Android 13+, an app installed from a downloaded APK may first need "Allow restricted settings" in its App info.
- It depends on the Costco app's screen labels and layout; a redesign can break it. The review screen shows what was read when nothing parses, to make that easy to spot.
- It runs only while the phone is unlocked and the owner starts it; it isn't a background job.
- Android only, like the rest of the app.
