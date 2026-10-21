# Costco 30-Day Price Match App

A tracker that watches the 30-day price adjustment window on Costco purchases and alerts you when an item you bought drops in price, so you can claim the difference.

> **Status:** Requirements complete, Design next. No application code yet. See the [project charter](docs/project-charter.md) and [requirements specification](docs/requirements.md).

## Why

Costco refunds the difference when an item's price drops within 30 days of purchase, but only if you notice. Catching a drop today means remembering every purchase and checking sale prices by hand. This app does the watching for you.

## Planned MVP

An iOS and Android phone app, backed by a small server API.

- **Automatic import of online orders** from forwarded Costco.com order confirmation emails
- **One-tap import of warehouse receipts** by sharing the receipt PDF from the Costco app
- **Countdown** of days left in each item's adjustment window
- **Price-drop push notifications** when a current price falls below what you paid, with email as a fallback
- **Claim card** with the details the membership counter asks for
- **Savings log** of claims made and dollars recovered

The app never logs into your Costco account or stores Costco credentials. The [charter](docs/project-charter.md#data-sources-and-feasibility) explains why.

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

- No storage of Costco credentials or payment card numbers
- Every record scoped to its owner; least-privilege access
- Secrets in environment configuration, never in source control
- Test fixtures use fake data only

## Disclaimer

This is an independent project. It is not affiliated with, sponsored by, or endorsed by Costco Wholesale Corporation. Price adjustments are granted at Costco's discretion under its current policy.
