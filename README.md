# Costco 30-Day Price Match App

A tracker that watches the 30-day price adjustment window on Costco purchases and alerts you when an item you bought drops in price, so you can claim the difference.

> **Status:** Requirements complete, Design next. No application code yet. See the [project charter](docs/project-charter.md) and [requirements specification](docs/requirements.md).

## Why

Costco refunds the difference when an item's price drops within 30 days of purchase, but only if you notice. Catching a drop today means remembering every purchase and checking sale prices by hand. This app does the watching for you.

## Planned MVP

An iOS and Android phone app, backed by a small server API.

- **Automatic receipt sync** of online and warehouse purchases from your Costco account, after a one-time sign-in on your phone (personal use, see [Terms of use](#terms-of-use))
- **Automatic price checks** for everything still in its adjustment window, online and in Warehouse Savings
- **Fallbacks you control:** share a receipt PDF from the Costco app, or enter purchases and prices by hand
- **Countdown** of days left in each item's adjustment window
- **Price-drop alerts** in the app and as a push notification banner when a current price falls below what you paid, with email as a fallback
- **Claim card** with the details the membership counter asks for
- **Savings log** of claims made and dollars recovered

Your Costco password is never stored and never leaves your phone; the app keeps only the signed-in session, in the phone's secure storage. The [charter](docs/project-charter.md#data-sources-and-feasibility) explains the approach and its fallbacks.

## Approach

This project follows the full software development lifecycle, with each phase producing a documented deliverable:

| Phase | Deliverable | Status |
| --- | --- | --- |
| 1. Planning | [Project charter](docs/project-charter.md) | Complete |
| 2. Requirements | [Requirements specification](docs/requirements.md): user stories, MVP spec, traceability | Complete |
| 3. Design | Architecture, data model, threat model | Not started |
| 4. Implementation | MVP features | Not started |
| 5. Testing | Unit and integration tests, test plan | Not started |
| 6. Deployment | Backend hosting, CI/CD, iOS and Android test builds | Not started |
| 7. Maintenance | Monitoring, feedback, backlog | Not started |

## Security and privacy principles

- No storage of Costco passwords or payment card numbers; the Costco session stays on the phone
- Every record scoped to its owner; least-privilege access
- Secrets in environment configuration, never in source control
- Test fixtures use fake data only

## Terms of use

Costco's [Site Terms](https://www.costco.com/f/-/terms-and-conditions-of-use) prohibit scraping and applications that interact with Costco's services without Costco's written consent. The automated receipt sync and price checks in this project are built for the developer's own account and personal use, at personal-use request rates, and never bypass access controls. They are not offered to other users or monetized. Anyone who runs this code is responsible for complying with Costco's terms. See the [charter](docs/project-charter.md#terms-of-use) for the review and decision.

## Disclaimer

This is an independent project. It is not affiliated with, sponsored by, or endorsed by Costco Wholesale Corporation. Price adjustments are granted at Costco's discretion under its current policy.
