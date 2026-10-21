# Costco Price Match App — Requirements Specification

**Status:** Draft for review · **Phase:** 2, Requirements · **Last updated:** Oct 20, 2026

## 1. Overview

This document turns the [project charter](project-charter.md) into testable requirements for the Phase 1 MVP: a single-user iOS and Android phone app, backed by a small server API, that imports Costco purchases, tracks each item's 30-day price adjustment window, takes current prices entered by hand, and notifies the owner when a claim is possible. The charter is the source of truth for scope. Every story, functional requirement (FR) and non-functional requirement (NFR) below traces to a charter scope item, goal, business rule or risk (see the [traceability matrix](#8-traceability-matrix)), and nothing here adds scope the charter marks as Phase 2 or out of scope. Where a requirement seems to need a charter change, it is recorded as an [open question](#9-open-questions) instead.

**Conventions**

- Story IDs use the form `US-<EPIC>-<NN>`. Priorities use MoSCoW: **Must**, **Should**, **Could**, **Won't** (this phase).
- Acceptance criteria use Given/When/Then and are written so each can become an automated test.
- "Window" means the price adjustment window defined by charter rule BR-1, with its length read from configuration (`PRICE_ADJUSTMENT_WINDOW_DAYS`).
- "Channel" is either `warehouse` or `online` (BR-3).
- "Notify" means a push notification to the Owner's phone, falling back to email when push permission is off or delivery fails (FR-16).
- All example data in this document is fictional.

## 2. Personas

| Persona | Phase | Description | Primary needs |
| --- | --- | --- | --- |
| **Owner** | 1 | The developer and only user in Phase 1. Shops both in the warehouse and on Costco.com and uses the app on an iPhone or Android phone. Comfortable with technology but wants the app to do the remembering. | Near-zero effort to log purchases; timely, accurate alerts; a claim card to show at the counter; a running total of money recovered. |
| **Member** | 2 | Any Costco member who signs up once the app opens to others. Less technical than the Owner and more sensitive about sharing purchase data. | Simple onboarding, clear privacy promises, the same core loop as the Owner. |

Phase 1 stories are written for the Owner. Stories that exist so the Member can be added later without a rewrite (data scoping, accounts) are marked as such.

## 3. Epics and user stories

| Epic | Name | Stories | Must | Should | Could |
| --- | --- | --- | --- | --- | --- |
| IMP | Import | 6 | 5 | 1 | 0 |
| TRK | Tracking | 4 | 3 | 1 | 0 |
| PRC | Prices | 3 | 1 | 1 | 1 |
| ALR | Alerts | 3 | 3 | 0 | 0 |
| CLM | Claims | 3 | 3 | 0 | 0 |
| ACC | Accounts | 3 | 3 | 0 | 0 |
| **Total** | | **22** | **18** | **3** | **1** |

### 3.1 IMP — Import

#### US-IMP-01 · Import online orders from forwarded confirmation emails · Must

As the Owner, I want my Costco.com order confirmation emails forwarded to the app to become tracked purchases automatically, so that online orders are logged without any typing.

- **Given** the Owner has registered a forwarding address and a forwarded Costco.com order confirmation arrives from it, **when** the app parses the email successfully, **then** one purchase is created per line item with item number, description, quantity, unit price paid, order number, order date as the purchase date, and channel `online`.
- **Given** a parsed order, **when** the purchases are saved, **then** each window starts on the order date, not the delivery date (BR-1).
- **Given** an email arrives from an address that is not the Owner's registered forwarding address, **when** it is received, **then** it is rejected, no purchase is created, and the rejection is logged without storing the message body.
- **Given** an email from the registered address whose Costco sender cannot be verified (see NFR-03), **when** it is received, **then** it goes to the review queue (US-IMP-05) instead of being imported automatically.

#### US-IMP-02 · Import warehouse receipts by sharing the receipt PDF · Must

As the Owner, I want to share a warehouse receipt PDF from the Costco app into this app in one action, so that warehouse purchases are logged without retyping the receipt.

- **Given** the Owner is signed in to the app on iOS or Android, **when** they share a receipt PDF from the Costco app through the system share sheet, **then** this app appears as a share target and the import starts without any further form to fill in (see OQ-09).
- **Given** a receipt PDF saved to the phone's files, **when** the Owner picks it from inside the app, **then** it is imported the same way.
- **Given** a valid receipt PDF, **when** it is parsed successfully, **then** one purchase is created per line item with item number, description, quantity, unit price paid, receipt date as the purchase date, warehouse number, and channel `warehouse`.
- **Given** a receipt line that is an instant-savings or discount line tied to an item, **when** the receipt is parsed, **then** the discount is applied to that item's price paid instead of being created as its own purchase.
- **Given** a file that is not a PDF, exceeds the size or page limits, or fails parsing, **when** it is shared or picked, **then** the Owner sees a clear message and the file goes to the review queue or is rejected as described in NFR-04 and US-IMP-05.

#### US-IMP-03 · Enter a purchase by hand · Must

As the Owner, I want to enter a purchase manually, so that I can track paper receipts or anything an import missed.

- **Given** the manual entry form, **when** the Owner submits item number, description, price paid, quantity, purchase date and channel (and warehouse number for `warehouse`), **then** a purchase is created and its window starts on the purchase date.
- **Given** a required field is missing or invalid (for example a negative price or a purchase date in the future), **when** the form is submitted, **then** it is rejected with a field-level message and nothing is saved.
- **Given** a purchase date older than the window length, **when** the form is submitted, **then** the purchase is saved as expired and the Owner is told no claim is possible.

#### US-IMP-04 · Detect duplicate imports · Must

As the Owner, I want the app to recognize a receipt or order I've already imported, so that I never get double-counted purchases or duplicate alerts.

- **Given** an online order already imported, **when** an email with the same order number arrives again, **then** no new purchases are created and the Owner is told it was a duplicate.
- **Given** a warehouse receipt already imported, **when** the same receipt is shared again, **then** no new purchases are created; the receipt is identified by its transaction identifier (exact fields confirmed in Design, see OQ-03) and by a hash of the file.
- **Given** a manual entry that matches an existing purchase on item number, purchase date, price paid and channel, **when** it is submitted, **then** the Owner is warned and must confirm before it is saved.

#### US-IMP-05 · Never lose an import that fails to parse · Must

As the Owner, I want any email or PDF the app can't fully read to land in a review queue, so that a purchase is never silently dropped.

- **Given** an import that fails parsing entirely, **when** processing finishes, **then** a review-queue entry is created with the reason, the parser version, and the received date, and the Owner is notified.
- **Given** an import where some lines parse and some don't, **when** processing finishes, **then** the parsed lines are saved as purchases and each unparsed line appears in the review queue.
- **Given** a review-queue entry, **when** the Owner opens it, **then** they can complete it as a manual entry (US-IMP-03) or dismiss it, and the entry is closed either way.
- **Given** any inbound email from the registered address or any PDF shared into the app, **when** processing ends, **then** it has produced either at least one purchase, a duplicate notice, or a review-queue entry (NFR-13).

#### US-IMP-06 · Correct or remove a purchase · Should

As the Owner, I want to edit or delete a purchase, so that a misread price or a returned item doesn't produce a wrong alert.

- **Given** an existing purchase, **when** the Owner edits its price paid, quantity or date, **then** its window and any open alerts are recalculated.
- **Given** an existing purchase with no claim in progress, **when** the Owner deletes it, **then** it no longer appears in tracking or alerts.
- **Given** a purchase with a claim marked `claimed` or `refunded`, **when** the Owner tries to delete it, **then** the app asks for confirmation and keeps the savings-log entry.

### 3.2 TRK — Tracking

#### US-TRK-01 · See days left in each item's window · Must

As the Owner, I want to see how many days are left to claim each item, so that I know what's still worth watching.

- **Given** a purchase dated D and a configured window of N days, **when** the Owner views it, **then** the last eligible date is D + N days and the days left are shown counting down to it (inclusive or exclusive counting confirmed by OQ-04).
- **Given** today is after the last eligible date, **when** the Owner views the purchase, **then** it shows as expired and is excluded from alerts.
- **Given** the configured window length changes, **when** the app restarts, **then** every open purchase's last eligible date is recalculated from the new value without a code change (BR-7).

#### US-TRK-02 · Record and respect the purchase channel · Must

As the Owner, I want every purchase tagged as warehouse or online, so that prices are only compared within the same channel and the right claim path is shown.

- **Given** a purchase from an email import, **then** its channel is `online`; from a receipt PDF, `warehouse`; from manual entry, the channel the Owner chose.
- **Given** a warehouse purchase and an online current price for the same item number, **when** prices are compared, **then** no alert is raised (BR-3).

#### US-TRK-03 · Exclude ineligible items · Must

As the Owner, I want items Costco won't adjust to be marked as excluded, so that I don't get alerts I can't claim.

- **Given** an exclusions list in configuration (item numbers and description keywords, for example precious metals), **when** a purchase matching it is imported, **then** it is marked excluded with the reason (BR-6).
- **Given** any purchase, **when** the Owner marks it excluded or un-excluded by hand, **then** the change is saved and alerts follow the new state.
- **Given** an excluded purchase, **when** a lower current price is entered, **then** no alert is sent.

#### US-TRK-04 · Home screen of open windows · Should

As the Owner, I want a single list of everything still in its window, sorted by days left, so that I can see what's closing soonest at a glance.

- **Given** open, expired and excluded purchases, **when** the Owner opens the app's home screen, **then** open purchases are listed by fewest days left first, and expired and excluded items are hidden by default but available through a filter.
- **Given** a purchase with a flagged price drop, **when** the home screen is shown, **then** that row is marked and opens its claim card when tapped.

### 3.3 PRC — Prices

#### US-PRC-01 · Enter a current price · Must

As the Owner, I want to record a sale price I've spotted, so that the app can check it against everything I've bought.

- **Given** the price entry form, **when** the Owner submits item number, channel, current price, the date seen, and optionally the sale end date, **then** the price is saved and immediately compared with every open purchase of that item number in that channel.
- **Given** a current price lower than the unit price paid on an open, non-excluded purchase, **when** it is saved, **then** that purchase is flagged and an alert is triggered (US-ALR-01).
- **Given** a current price equal to or higher than the price paid, **when** it is saved, **then** nothing is flagged.

#### US-PRC-02 · Keep a price history per item · Should

As the Owner, I want to see every price recorded for an item, so that I can judge how often it goes on sale and back up a claim.

- **Given** several prices entered for one item number, **when** the Owner views that item, **then** all prices are listed with channel, date seen and sale end date, newest first.
- **Given** a price entry, **when** it is saved, **then** earlier entries are kept, not overwritten.

#### US-PRC-03 · Respect promotional quantity limits · Could

As the Owner, I want to record a sale's per-member quantity limit, so that the claim card doesn't overstate what I can recover.

- **Given** a current price entered with a quantity limit L, **when** a purchase of quantity Q is flagged, **then** the claim amount uses min(Q, L) units (see OQ-06).

### 3.4 ALR — Alerts

#### US-ALR-01 · Notify me when a price drops · Must

As the Owner, I want a push notification as soon as an item I bought is cheaper, so that I can claim before the sale ends.

- **Given** a purchase flagged by a new current price, **when** the flag is created, **then** a push notification is sent within 15 minutes showing the item description and the amount saved, and tapping it opens the claim card with price paid, current price, sale end date if known and last eligible date (BR-5).
- **Given** the app is opened for the first time after sign-in, **when** it asks for notification permission and the Owner allows it, **then** the phone is registered for push notifications.
- **Given** push permission is off or the push service reports the phone unreachable, **when** an alert is due, **then** the same alert is sent by email instead, with a link that opens the claim card.
- **Given** a purchase already alerted for a price, **when** the same or a higher price is entered again, **then** no duplicate alert is sent; a lower price sends a new alert.
- **Given** any alert is built, **then** it contains no full receipt contents, card data or membership number (NFR-25).

#### US-ALR-02 · Remind me before a window closes · Must

As the Owner, I want a reminder a few days before an item's window ends, so that I check its price before it's too late.

- **Given** an open, non-excluded purchase whose last eligible date is a configurable number of days away (default 3), **when** the daily reminder job runs, **then** the Owner receives one notification summarizing them, which opens a list of every such purchase.
- **Given** no purchases meet the condition, **when** the job runs, **then** no notification is sent.
- **Given** the job missed a day, **when** it next runs, **then** it includes the purchases it would have listed.

#### US-ALR-03 · Remind me to import warehouse receipts · Must

As the Owner, I want a reminder to share my latest warehouse receipt, so that warehouse purchases don't go untracked.

- **Given** a reminder schedule in configuration (default weekly), **when** it fires and no warehouse receipt has been imported since the last reminder, **then** the Owner is notified and asked to share any new receipts from the Costco app.
- **Given** a warehouse receipt was imported since the last reminder, **when** the schedule fires, **then** no reminder is sent.

### 3.5 CLM — Claims

#### US-CLM-01 · Show a claim card · Must

As the Owner, I want a screen I can show at the counter or use online with everything needed for the claim, so that the adjustment takes as little time as possible.

- **Given** a flagged purchase, **when** the Owner opens its claim card, **then** it shows item number, description, purchase date, channel, warehouse number or order number, quantity, price paid, current price, refund due (difference × eligible quantity), sale end date if known, and last eligible date.
- **Given** a `warehouse` purchase, **then** the card says to take it to the warehouse's returns or membership counter; **given** an `online` purchase, **then** it says to use the price adjustment request on the Costco.com order (BR-4).
- **Given** the card is opened on the smallest supported phone screen, **then** it fits without horizontal scrolling and the item number is in large type.
- **Given** the phone has no connection (common inside a warehouse), **when** the Owner opens the claim card of a flagged purchase, **then** the most recently synced card is shown with the time it was last updated.

#### US-CLM-02 · Track claim status · Must

As the Owner, I want to move each claim through its stages, so that I know what's pending and what's been paid.

- **Given** a flagged purchase, **when** the Owner marks it claimed, refunded, denied (with an optional reason) or dismissed, **then** the status and the date of each change are saved.
- **Given** the status flow, **then** only these moves are allowed: flagged → claimed or dismissed; claimed → refunded or denied (BR-8).
- **Given** a claim marked refunded, **when** the Owner enters the amount actually refunded, **then** that amount is saved; if none is entered, the refund due from the claim card is used.

#### US-CLM-03 · See money recovered · Must

As the Owner, I want a log of claims and total savings, so that I know the app is worth using.

- **Given** refunded claims, **when** the Owner opens the savings log, **then** each claim is listed with date, item, channel and amount, with an all-time total and a total per month.
- **Given** claims marked refunded and denied, **when** the savings log is shown, **then** it also shows alert accuracy as refunded ÷ (refunded + denied), the charter's "Trustworthy alerts" metric.

### 3.6 ACC — Accounts

#### US-ACC-01 · Sign in to a single account · Must

As the Owner, I want to sign in with a password, so that only I can see my purchases.

- **Given** the app has no account, **when** it is first set up, **then** exactly one account is created through a one-time setup step or command, and public sign-up is not available (Phase 2).
- **Given** correct credentials, **when** the Owner signs in, **then** a session starts; **given** wrong credentials, **then** a generic error is shown that doesn't reveal which field was wrong.
- **Given** repeated failed sign-ins, **when** the limit in NFR-08 is reached, **then** further attempts are blocked for the lockout period.
- **Given** the app is opened, **when** there is no valid session, **then** the sign-in screen is shown and no purchase data is displayed.
- **Given** the Owner signs out, **then** session tokens and cached purchase data are deleted from the phone and the session is revoked on the server.

#### US-ACC-02 · Keep every record scoped to its owner · Must (multi-user foundation)

As the Owner, I want every record tied to my account, so that other members can be added in Phase 2 without anyone seeing my data.

- **Given** any stored purchase, price, alert, claim or import, **then** it carries the owning user's ID, except shared reference data such as the exclusions list.
- **Given** two accounts created in a test, **when** account A requests any record belonging to B by ID, **then** the app responds as if the record doesn't exist.

#### US-ACC-03 · Register my forwarding address · Must

As the Owner, I want to register the email address I forward Costco orders from, so that the app accepts my emails and rejects everyone else's.

- **Given** the account settings, **when** the Owner enters a forwarding address, **then** the app sends a confirmation code to it and only accepts mail from it once the code is confirmed.
- **Given** the settings, **then** the Owner can see the app's inbound address to set up a forwarding rule.

## 4. Functional requirements

| ID | The system shall… | Stories |
| --- | --- | --- |
| FR-01 | Receive forwarded emails at an inbound address and accept them only from the account's confirmed forwarding address. | US-IMP-01, US-ACC-03 |
| FR-02 | Parse Costco.com order confirmation emails into one purchase per line item (item number, description, quantity, unit price, order number, order date) with channel `online`. | US-IMP-01 |
| FR-03 | Accept a receipt PDF through the iOS and Android share sheet and an in-app file picker, and parse it into one purchase per line item (item number, description, quantity, unit price, receipt date, warehouse number) with channel `warehouse`. | US-IMP-02 |
| FR-04 | Apply instant-savings and discount lines on a receipt or order to the price paid of the item they belong to. | US-IMP-01, US-IMP-02 |
| FR-05 | Provide a manual purchase form with validation of required fields, non-negative prices and non-future dates. | US-IMP-03 |
| FR-06 | Detect duplicate imports by order number, receipt transaction identifier and file hash, and warn on manual entries matching an existing purchase. | US-IMP-04 |
| FR-07 | Place any import or line that fails parsing or sender verification in a review queue with reason, parser version and received date, and notify the Owner. | US-IMP-01, US-IMP-05 |
| FR-08 | Let the Owner resolve a review-queue entry as a manual purchase or dismiss it. | US-IMP-05 |
| FR-09 | Let the Owner edit and delete purchases, recalculating windows and alerts, and keep savings-log entries for claimed or refunded purchases. | US-IMP-06 |
| FR-10 | Calculate each purchase's last eligible date as purchase date plus the configured window length, and mark purchases past that date as expired. | US-TRK-01 |
| FR-11 | Store a channel on every purchase and every current price, and compare prices only within the same channel. | US-TRK-02, US-PRC-01 |
| FR-12 | Mark purchases as excluded automatically from a configured exclusions list, and let the Owner set or clear the excluded flag by hand. | US-TRK-03 |
| FR-13 | Show a home screen of open purchases sorted by days left, with filters for expired and excluded items and a marker on flagged items. | US-TRK-04 |
| FR-14 | Provide a current-price form (item number, channel, price, date seen, optional sale end date, optional quantity limit) and keep every entry as price history. | US-PRC-01, US-PRC-02, US-PRC-03 |
| FR-15 | On each new current price, flag every open, non-excluded purchase of that item number and channel whose unit price paid is higher. | US-PRC-01 |
| FR-16 | Send a price-drop push notification for each new flag, once per purchase per lower price, and send it by email instead when push permission is off or delivery fails. | US-ALR-01 |
| FR-17 | Run a daily job that sends one notification summarizing open, non-excluded purchases whose last eligible date is within the configured reminder lead time, catching up after a missed run. | US-ALR-02 |
| FR-18 | Run a scheduled job that reminds the Owner to share warehouse receipts when none were imported since the last reminder. | US-ALR-03 |
| FR-19 | Generate a claim card with the fields and channel-specific claim path in US-CLM-01. | US-CLM-01 |
| FR-20 | Track claim status through flagged, claimed, refunded, denied and dismissed, enforce the allowed moves, and record the date of each change. | US-CLM-02 |
| FR-21 | Show a savings log with per-claim entries, all-time and monthly totals, and alert accuracy. | US-CLM-03 |
| FR-22 | Provide password sign-in for a single account created through a one-time setup step, with no public sign-up. | US-ACC-01 |
| FR-23 | Require a valid access token on every API call other than sign-in, and show the sign-in screen when the app has no valid session. | US-ACC-01 |
| FR-24 | Store the owning user ID on every user record and filter every read and write by the signed-in user's ID. | US-ACC-02 |
| FR-25 | Confirm the forwarding address with a one-time code before accepting mail from it, and display the app's inbound address. | US-ACC-03 |
| FR-26 | Register the phone for push notifications after the Owner grants permission, and remove the registration on sign-out. | US-ALR-01, US-ACC-01 |
| FR-27 | Cache claim cards for flagged purchases on the phone so they open without a connection, showing when each was last synced. | US-CLM-01 |
| FR-28 | On sign-out, delete session tokens and cached purchase data from the phone and revoke the session on the server. | US-ACC-01 |

## 5. Non-functional requirements

| ID | Category | Requirement | Target or test | Traces to |
| --- | --- | --- | --- | --- |
| NFR-01 | Security | The app never asks for, receives or stores Costco account credentials and never logs in to or scrapes costco.com. | No code path or config field for Costco credentials; code review checklist item. | Charter scope (out of scope); risk "Holding members' Costco credentials" |
| NFR-02 | Security | No payment card numbers are stored. Card digits on a receipt or email (even masked) are discarded during parsing. | Fixture test: parsed output of a fake receipt containing masked card digits has no card field or value. | Charter constraints |
| NFR-03 | Security | Inbound email is accepted only from the confirmed forwarding address, verified by SPF or DKIM on the forwarding message. Costco as the original sender is verified by a passing DKIM signature for a Costco domain on the forwarded original; if it can't be verified, the import goes to the review queue. | Tests: wrong sender rejected; spoofed Costco message without a valid signature lands in review. | Risk "Spoofed or malicious inbound emails"; US-IMP-01 |
| NFR-04 | Security | Shared or picked files must be PDFs (checked by content, not extension), at most 5 MB and 10 pages, and are parsed in an isolated process with a 10-second time limit, no network access, and no execution of embedded scripts or attachments. Email HTML is never rendered; only text is extracted and links are never followed. | Tests with oversized, renamed, malformed and script-bearing fake files. | Risk "Spoofed or malicious inbound emails and PDFs"; US-IMP-02 |
| NFR-05 | Security | Secrets (keys, SMTP and webhook credentials) live only in environment configuration. `.env` files are never committed and secret scanning runs on the repository. | Secret scan passes on every commit; `.env.example` holds placeholders only. | Charter vision ("secrets in configuration"); README principles |
| NFR-06 | Security | The backend API meets OWASP Application Security Verification Standard (ASVS) Level 1, and the phone app meets the OWASP Mobile Application Security Verification Standard (MASVS) baseline (MAS-L1 testing profile). | ASVS L1 and MASVS checklists completed in the Testing phase with every item passed or justified as not applicable. | Charter risks; README principles |
| NFR-07 | Security | All API traffic uses TLS 1.2 or later, and the app refuses plain HTTP. Access tokens are short-lived (15 minutes) with rotating refresh tokens that the server can revoke. Tokens are kept only in the iOS Keychain or Android Keystore, never in plain storage or logs. | Automated tests for token expiry, refresh rotation and revocation; storage review against MASVS. | US-ACC-01 |
| NFR-08 | Security | Passwords are hashed with Argon2id or bcrypt. Sign-in is limited to 5 failed attempts per 15 minutes before a temporary lockout. | Unit tests for hashing and lockout. | US-ACC-01 |
| NFR-09 | Security / Privacy | Every read and write is scoped to the signed-in user (least privilege). | Two-account authorization tests on every endpoint return "not found" for another user's records. | US-ACC-02; charter vision |
| NFR-10 | Privacy | Purchase data, prices, claims and stored import files are encrypted at rest on the server. Data cached on the phone uses the platform's encrypted storage (iOS Data Protection, Android encrypted storage). | Server encryption settings documented in Design and verified at deployment; device storage reviewed against MASVS. | Risk "Receipt data leaks" |
| NFR-11 | Privacy | No real receipts, emails or personal data are committed. Test fixtures use invented data only, modeled on real structure. | Pre-commit PII scan; fixture review in every PR touching parsers. | Charter risks; README principles |
| NFR-12 | Privacy | Raw import files (emails, PDFs) are deleted once their items are imported or resolved from the review queue, or after 30 days, whichever comes first. Logs never contain message bodies, receipt contents, passwords or session tokens. | Retention job test; log review in Testing. | Risk "Receipt data leaks" |
| NFR-13 | Reliability | No import is silently dropped. Every accepted email or PDF ends as imported purchases, a duplicate notice, or a review-queue entry. | 100% of fixture imports, including malformed ones, end in one of those three states. | Risk "Costco changes its email or receipt PDF format"; US-IMP-05 |
| NFR-14 | Reliability | Inbound import handling is idempotent: a retried delivery never creates duplicate purchases. Scheduled jobs catch up after a missed run. | Replay test of the same delivery; skipped-day test for reminders. | US-IMP-04; US-ALR-02 |
| NFR-15 | Reliability | Price-drop alerts are handed to the push service (or email, as fallback) within 15 minutes of the price entry. | Measured in the Testing phase; well within the charter's one-day assumption. | Charter assumptions; BR-5 |
| NFR-16 | Reliability | The database is backed up daily, and a restore is tested once before the end of Phase 1. | Backup schedule in Design; restore drill recorded. | Charter goal "Recover money" |
| NFR-17 | Maintainability | Business rules (window length, exclusions list, reminder lead time, reminder schedule) are configuration, not code. | Changing each value changes behavior with no code change (test). | BR-6, BR-7 |
| NFR-18 | Maintainability | Email and PDF parsers are versioned. Each version has fixture tests with fake data, and every import records the parser version used. | Parser test suite runs in CI; version stored on each import. | Risk "Costco changes its email or receipt PDF format" |
| NFR-19 | Maintainability | Business-rule logic (windows, comparisons, claim amounts, status changes) is separate from the UI and has at least 90% branch coverage. | Coverage report in CI. | Charter vision ("business rules out of the UI") |
| NFR-20 | Usability | Logging one receipt takes under 2 minutes. | Median under 2 minutes over the first month of use, timed from opening the receipt in the Costco app to purchases saved. | Charter goal "Low effort" |
| NFR-21 | Usability | The app supports the current and previous major versions of iOS and Android. Every screen works without horizontal scrolling on screens from 360 dp (Android) or 375 pt (iPhone) wide and up, including with larger system text sizes. | Checked on the smallest supported screen of each platform in Testing. | US-CLM-01; US-IMP-02 |
| NFR-22 | Cost | Phase 1 hosting, email and storage run at low or zero cost, preferring free tiers. Any paid service is recorded as a Design decision with its monthly cost. App store developer account fees are the expected fixed cost. | Monthly cost reviewed at the end of Phase 1 (ceiling set in OQ-07). | Charter constraints |
| NFR-23 | Compliance | The app uses a generic name and shows that it is not affiliated with Costco. | Disclaimer visible on the sign-in screen, the app's About screen and the README. | Risks "Using the Costco name or logo implies endorsement" and "App store review rejects the app" |
| NFR-24 | Portability | The iOS and Android apps come from one cross-platform codebase (framework chosen in Design). Phase 1 builds are distributed through TestFlight and Google Play internal testing. | Both builds installable from their test tracks by the end of Phase 1. | Charter vision (phone app); charter scope (test-track install) |
| NFR-25 | Privacy | Push notification payloads contain only the item description and the amount saved: no receipt contents, card data, membership number or order number. Details load after the app opens and the session is checked. | Payload fixture test. | Risk "Purchase details appear in lock-screen notifications" |

## 6. Business rules

The business rules are defined in the charter's [business rules](project-charter.md#business-rules) section and are not repeated here. This table shows where each one is enforced.

| Rule | Enforced by |
| --- | --- |
| BR-1 Window starts at the purchase date | US-IMP-01, US-IMP-03, US-TRK-01 · FR-02, FR-10 |
| BR-2 Only Costco's own lower price counts | US-PRC-01 · FR-14, FR-15 (prices are entered per Costco item number and channel only) |
| BR-3 Warehouse and online are separate channels | US-TRK-02 · FR-11 |
| BR-4 Claim path differs by channel | US-CLM-01 · FR-19 |
| BR-5 Claims may be refused after a sale ends | US-ALR-01, US-PRC-01 · FR-14, FR-16, NFR-15 |
| BR-6 Some items and buyers are excluded | US-TRK-03 · FR-12, NFR-17 |
| BR-7 Costco may change the policy | US-TRK-01 · NFR-17 |
| BR-8 Refunds take time; status is tracked | US-CLM-02 · FR-20 |

A check of the rules against Costco's official policy turned up possible additions and refinements. They are recorded in OQ-01 and OQ-06 rather than applied, because the charter is the source of truth for rules.

## 7. MVP definition

Phase 1 ships when all 18 Must-have stories pass their acceptance criteria and every NFR in section 5 is met or has a recorded, justified exception.

**Must-have stories (Phase 1 MVP)**

| Epic | Stories |
| --- | --- |
| Import | US-IMP-01, US-IMP-02, US-IMP-03, US-IMP-04, US-IMP-05 |
| Tracking | US-TRK-01, US-TRK-02, US-TRK-03 |
| Prices | US-PRC-01 |
| Alerts | US-ALR-01, US-ALR-02, US-ALR-03 |
| Claims | US-CLM-01, US-CLM-02, US-CLM-03 |
| Accounts | US-ACC-01, US-ACC-02, US-ACC-03 |

**Should and Could (built in Phase 1 if time allows, in this order):** US-IMP-06, US-TRK-04, US-PRC-02, US-PRC-03.

**Deferred to Phase 2 (Won't have in the MVP)**, as set by the charter:

- Read-only Gmail connection (OAuth) as an alternative to forwarding
- Receipt photo import with OCR for paper receipts
- Import reminders triggered by a linked card transaction feed
- Open sign-up and multiple accounts
- Community-reported sale prices
- Importing prices from the monthly savings book (investigation only)
- Browser extension reading the member's own session (investigation only)
- Public listing in the App Store and Google Play

**Out of scope entirely**, as set by the charter: logging into a member's Costco account, storing Costco credentials, scraping costco.com, filing adjustments on the member's behalf, and non-Costco retailers.

## 8. Traceability matrix

Every charter scope item, goal and risk that the MVP addresses, mapped to the stories and requirements that satisfy it.

| Charter item | Stories | FRs | NFRs |
| --- | --- | --- | --- |
| Scope: auto-import online orders from forwarded emails | US-IMP-01, US-ACC-03 | FR-01, FR-02, FR-04, FR-25 | NFR-03, NFR-14 |
| Scope: one-tap import of warehouse receipt PDFs | US-IMP-02 | FR-03, FR-04 | NFR-04, NFR-20, NFR-21 |
| Scope: reminder to import warehouse receipts | US-ALR-03 | FR-18 | NFR-14, NFR-17 |
| Scope: manual purchase entry (fallback) | US-IMP-03, US-IMP-06 | FR-05, FR-09 | — |
| Scope: countdown of days left per window | US-TRK-01, US-TRK-04 | FR-10, FR-13 | NFR-17, NFR-19 |
| Scope: manual entry of current sale price | US-PRC-01, US-PRC-02, US-PRC-03 | FR-11, FR-14, FR-15 | NFR-19 |
| Scope: alert when current price is below price paid (push, email fallback) | US-ALR-01, US-ALR-02 | FR-16, FR-17, FR-26 | NFR-15, NFR-25 |
| Scope: claim card | US-CLM-01 | FR-19, FR-27 | NFR-21 |
| Scope: log of claims and dollars recovered | US-CLM-02, US-CLM-03 | FR-20, FR-21 | — |
| Scope: user accounts and authentication (single account) | US-ACC-01, US-ACC-02 | FR-22, FR-23, FR-24, FR-28 | NFR-07, NFR-08, NFR-09 |
| Scope: iOS and Android app installed through TestFlight and Google Play internal testing | US-IMP-02, US-CLM-01 | FR-03, FR-27 | NFR-21, NFR-24 |
| Scope (out): no Costco login, credentials or scraping | — | — | NFR-01 |
| Rules BR-1 to BR-8 | See [section 6](#6-business-rules) | FR-02, FR-10 to FR-12, FR-14 to FR-16, FR-19, FR-20 | NFR-15, NFR-17 |
| Goal: recover money | US-PRC-01, US-ALR-01, US-CLM-01, US-CLM-03 | FR-15, FR-16, FR-19, FR-21 | NFR-16 |
| Goal: low effort (under 2 minutes per receipt) | US-IMP-01, US-IMP-02 | FR-01 to FR-04 | NFR-20 |
| Goal: trustworthy alerts (90% claimable) | US-IMP-04, US-TRK-02, US-TRK-03, US-CLM-02, US-CLM-03 | FR-06, FR-11, FR-12, FR-20, FR-21 | NFR-14 |
| Goal: no missed windows | US-ALR-02, US-ALR-03, US-IMP-05 | FR-07, FR-17, FR-18 | NFR-13 |
| Goal: resume-ready repo | — | — | NFR-11, NFR-18, NFR-19 |
| Vision: multi-user foundation | US-ACC-02 | FR-24 | NFR-09 |
| Constraint: no card numbers or Costco credentials stored | — | — | NFR-01, NFR-02 |
| Constraint: low or zero hosting cost | — | — | NFR-22 |
| Risk: spoofed or malicious emails and PDFs | US-IMP-01, US-IMP-02, US-IMP-05 | FR-01, FR-07 | NFR-03, NFR-04 |
| Risk: Costco changes its email or PDF format | US-IMP-05 | FR-07, FR-08 | NFR-13, NFR-18 |
| Risk: receipt data leaks | US-ACC-01, US-ACC-02 | FR-23, FR-24 | NFR-05 to NFR-12 |
| Risk: Costco changes the policy | US-TRK-01, US-TRK-03 | FR-10, FR-12 | NFR-17 |
| Risk: implied endorsement | — | — | NFR-23 |
| Risk: app store review rejects the app | — | — | NFR-23, NFR-24 |
| Risk: purchase details in lock-screen notifications | US-ALR-01 | FR-16 | NFR-25 |
| Risk: no permitted automated price source | US-PRC-01 | FR-14 | — (pluggable price source is a Design item) |

## 9. Open questions

| ID | Question | Owner | Blocks | Notes |
| --- | --- | --- | --- | --- |
| OQ-01 | Do the charter's rules BR-1 to BR-8 match Costco's official price adjustment policy? | Project owner | Design | See findings below. The official page couldn't be read automatically, so it needs a manual check. |
| OQ-02 | Which inbound email service receives forwarded order emails? | Project owner | Design | Decide in Design against the candidate requirements below. |
| OQ-03 | What is the exact structure of a Costco warehouse receipt PDF and a Costco.com order confirmation email, including the fields that identify a receipt uniquely? | Project owner | Design (parser design and duplicate key) | Inspect one real sample of each locally. **Never commit a real sample.** Build invented fixtures with the same structure. |
| OQ-04 | Is day 30 itself eligible (inclusive counting), and whose time zone defines "today" for the warehouse channel? | Project owner | Design | Affects FR-10 and the countdown. Confirm at a warehouse counter or with Costco customer service. |
| OQ-05 | Does an automatic forwarding rule keep Costco's original DKIM signature intact so NFR-03 can verify it? | Project owner | Design | Depends on the email provider and on OQ-02. If not, decide what fallback verification is acceptable. |
| OQ-06 | Should the charter add rules for promotional quantity limits and for claiming promotional items within the promotion dates? | Project owner | Implementation of US-PRC-03 | Secondary sources quote the official policy on both points (see findings). Requires a charter revision, so it's recorded here instead. |
| OQ-07 | What monthly cost ceiling counts as "low" for Phase 1 hosting, email and storage? | Project owner | Design | Needed to make NFR-22 measurable. |
| OQ-08 | Which public sources of Costco sale prices allow reuse, and in what format? | Project owner | Phase 2 | Carried over from the charter. Not needed for the MVP, where prices are entered by hand. |
| OQ-09 | Can the Costco app share or export a warehouse receipt as a PDF on both iOS and Android, and in what form does it arrive? | Project owner | Design | US-IMP-02 depends on it. Check on both platforms with a real receipt, committing nothing from it. If a platform can't share a PDF, record the gap and fall back to the in-app file picker or manual entry. |
| OQ-10 | Which push notification service will the backend use: Apple Push Notification service and Firebase Cloud Messaging directly, or a provider in front of both? | Project owner | Design | Must cover iOS and Android, fit NFR-22, and allow minimal payloads (NFR-25). |

### OQ-01 findings: policy check

Costco's customer service page for price adjustments ("Price Adjustment - Costco.com Orders", article 628 on customerservice.costco.com) blocks automated reading, so it was checked through secondary sources that quote it. The owner should confirm these points against the live page before Design.

| Point | Charter | What the sources report | Status |
| --- | --- | --- | --- |
| Window | BR-1: 30 days from purchase, not delivery | Quoted as "within 30 days of the date of purchase." Sources say the clock starts at the order date for online orders. | Consistent |
| Competitors | BR-2: Costco's own price only | Quoted as "Costco does not price match with other businesses or retailers." | Consistent |
| Channels | BR-3: warehouse and online are separate | Sources say warehouse and online prices can't be matched against each other. | Consistent |
| Claim path | BR-4: warehouse counter; Costco.com form | Online claims use a "Request a Price Match" option on the Costco.com order; warehouse claims go to the returns counter of the purchase warehouse. | Consistent; the online path is a button on the order, not a separate form |
| Promotional items | BR-5: claims refused once a sale ended (member reports) | Promotional items reportedly must be claimed within both the promotion dates and the 30-day window. | Stronger than the charter states; see OQ-06 |
| Quantity limits | Not covered | Promotional matches reportedly apply only "up to the limit quantity." | Gap; see OQ-06 and US-PRC-03 |
| Exclusions | BR-6: gold bullion as an example; resellers excluded | Precious metals are excluded; reseller accounts get promotional pricing only when buying during the promotion dates. | Mostly consistent; reseller rule is narrower than the charter's wording |
| Discretion | BR-7: Costco may deny or change the policy | Some warehouses reportedly approve requests a few days late at their discretion. | Consistent; the app should not rely on it |
| Refunds | BR-8: online refunds to original payment, 5–10 business days | Same for online; warehouse adjustments are refunded to the original form of payment at the counter. | Consistent |

Sources: [Costco customer service, Price Adjustment - Costco.com Orders](https://customerservice.costco.com/app/answers/detail/a_id/628/~/price-adjustment---costco.com-orders) (not readable automatically), [Thrifle, Aug 2026](https://thrifle.com/blog/costco-price-adjustment), [Priceva, updated Jun 2026](https://priceva.com/blog/costco-price-match).

### OQ-02 candidate requirements for the inbound email service

Whichever service is chosen in Design should:

- Deliver each inbound message to the app by webhook or API, with the raw message available so DKIM signatures can be checked (NFR-03, OQ-05)
- Sign or authenticate its webhook calls so the app can reject forged deliveries (`INBOUND_WEBHOOK_SECRET`)
- Support a dedicated receiving address or subdomain
- Retry failed deliveries, so the app's idempotent handling (NFR-14) is the only deduplication needed
- Let the app set a message size limit and keep no long-term copy of messages, or allow deletion (NFR-12)
- Fit the Phase 1 cost target (NFR-22)
