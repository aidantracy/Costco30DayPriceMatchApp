# Spikes

Short investigations run at the start of Implementation to answer the open items in [architecture section 9](../design/architecture.md#9-to-confirm-before-implementation). Each spike records what was learned using **invented example data only**. Real receipts, screenshots and account pages are inspected locally and never committed.

| Spike | Topic | Status |
| --- | --- | --- |
| S-1 | Warehouse receipt structure | [Partly done](s1-warehouse-receipt.md): receipt format confirmed from the Costco app; costco.com page structure still to inspect |
| S-2 | Warehouse Savings by warehouse and item numbers | Not started |
| S-3 | Sharing a receipt PDF from the Costco app | [Done](s1-warehouse-receipt.md#s-3-sharing-from-the-costco-app): no share or download option; replaced by screenshot import (ADR 0006) |
| S-4 | Background fetch frequency | Not started |
| S-5 | Push service limits and email provider | Not started |
| S-6 | Encrypted SQLite on both platforms | Not started |
| S-7 | On-device text recognition for receipt screenshots | Not started |
