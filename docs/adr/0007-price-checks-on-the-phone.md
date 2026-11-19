# ADR 0007: Run price checks on the phone

**Status:** Accepted · **Date:** Nov 11, 2026 · **Supersedes:** ADR 0004 · **Informed by:** spike S-2

## Context

ADR 0004 put the daily price check in a Cloud Run job. Spike S-2 found that:

- costco.com product pages show a warehouse-specific **Warehouse Price** and instant-savings dates, keyed by the same item numbers as receipts, for items sold online.
- The first request from Google Cloud Shell (Google Cloud addresses, like Cloud Run) got **HTTP 429**. Costco's bot protection refuses cloud traffic, so a server job can't read the pages at all.
- The same pages load normally in a browser on the owner's home connection.

## Decision

The phone runs the price check, in a hidden in-app browser view (`react-native-webview`), while the app is open:

1. The app asks the API which items are due (`GET /price-checks/due`): items in open purchases not looked up today, and items that weren't sold online, after a week.
2. For each item it loads `costco.com/s?keyword=<item number>`, which goes to the product page when the item is online. It reads the item number, Warehouse Price, Online Price and promotion end date from the page text, one item at a time with a pause between items (NFR-21).
3. It sends only those values to `POST /price-checks`. The server records automatic observations, flags drops with the existing rules, and returns them so the app can show them at once.
4. On a bot challenge, the check stops for the day and reports `challenge` through `/sync-runs`. The existing health alerts then tell the owner (FR-21). It never retries around a challenge.

The owner chooses their warehouse once in the in-app browser, so its cookies give warehouse prices for the right store.

## Consequences

- Checks happen when the app is opened (and on pull-to-refresh), not at a fixed time; Android can't run a browser view in the background. The daily reminder notification gives a reason to open the app.
- Costco traffic comes from the owner's phone at a personal-use rate, using a real browser engine.
- Page content never leaves the phone; only prices and dates are sent.
- Items that are only sold in the warehouse aren't covered. They need the Warehouse Savings import (next step from S-2).
- `react-native-webview` is a native module, so the development build has to be rebuilt once.

## Alternatives considered

- **Keep the server job:** blocked (HTTP 429 on the first request).
- **Plain `fetch` from the phone:** skips the browser engine that bot protection expects, so it's likely to be refused too, and it can't use the warehouse cookies the owner sets in a browser.
- **Reading the Costco app's private API:** needs the owner's session token outside the app and is the most fragile option; it's deferred to receipt sync, if ever.
