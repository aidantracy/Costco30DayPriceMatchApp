# Costco Price Match App — Requirements Specification

**Status:** Draft for review · **Phase:** 2, Requirements · **Last updated:** Oct 21, 2026

## 1. Overview

This document turns the [project charter](project-charter.md) into testable requirements for the Phase 1 MVP: a single-user iOS and Android phone app, backed by a small server API, that syncs the owner's Costco receipts from their own account, checks current prices for every item still in its 30-day price adjustment window, and alerts the owner in the app and with a notification banner when a claim is possible. Sharing a receipt PDF and manual entry remain available as fallbacks. Because Costco's Site Terms prohibit automated access without written consent, the automated features are limited to the owner's own account for personal use (see OQ-02). The charter is the source of truth for scope. Every story, functional requirement (FR) and non-functional requirement (NFR) below traces to a charter scope item, goal, business rule or risk (see the [traceability matrix](#8-traceability-matrix)), and nothing here adds scope the charter marks as Phase 2 or out of scope. Where a requirement seems to need a charter change, it is recorded as an [open question](#9-open-questions) instead.

**Conventions**

- Story IDs use the form `US-<EPIC>-<NN>`. Priorities use MoSCoW: **Must**, **Should**, **Could**, **Won't** (this phase).
- Acceptance criteria use Given/When/Then and are written so each can become an automated test.
- "Window" means the price adjustment window defined by charter rule BR-1, with its length read from configuration (`PRICE_ADJUSTMENT_WINDOW_DAYS`).
- "Channel" is either `warehouse` or `online` (BR-3).
- "Costco connection" means the signed-in Costco session the app keeps on the Owner's phone. "App account" means the Owner's account with this app's own server. They are separate sign-ins.
- "Notify" means a push notification banner on the Owner's phone, falling back to email when push permission is off or delivery fails (FR-19).
- "Sync" and "price check" are the automated sources; "fallback" means a shared receipt PDF or manual entry.
- All example data in this document is fictional.

## 2. Personas

| Persona | Phase | Description | Primary needs |
| --- | --- | --- | --- |
| **Owner** | 1 | The developer and only user in Phase 1. Shops both in the warehouse and on Costco.com and uses the app on an iPhone or Android phone. Wants the app to do all the remembering and checking. | Zero effort after a one-time setup; timely, accurate alerts; a claim card to show at the counter; a way to keep going by hand if automation breaks; a running total of money recovered. |
| **Member** | 2 | Any Costco member who signs up once the app opens to others. Less technical than the Owner and more cautious about connecting accounts and sharing purchase data. | Simple onboarding, clear privacy promises about the Costco connection, the same core loop as the Owner. |

Phase 1 stories are written for the Owner. Stories that exist so the Member can be added later without a rewrite (data scoping, accounts) are marked as such.

## 3. Epics and user stories

| Epic | Name | Stories | Must | Should | Could |
| --- | --- | --- | --- | --- | --- |
| IMP | Import | 7 | 6 | 1 | 0 |
| TRK | Tracking | 4 | 3 | 1 | 0 |
| PRC | Prices | 4 | 2 | 1 | 1 |
| ALR | Alerts | 3 | 3 | 0 | 0 |
| CLM | Claims | 3 | 3 | 0 | 0 |
| ACC | Accounts | 3 | 3 | 0 | 0 |
| **Total** | | **24** | **20** | **3** | **1** |

### 3.1 IMP — Import

#### US-IMP-01 · Connect my Costco account once · Must

As the Owner, I want to sign in to Costco once inside the app, so that it can sync my purchases without me doing anything after that.

- **Given** the Owner opens the Costco connection screen, **when** they choose to connect, **then** Costco's own sign-in page opens in an in-app browser, and the Owner completes sign-in and any verification code there themselves.
- **Given** sign-in succeeds, **when** the in-app browser closes, **then** only the resulting Costco session is kept, in the iOS Keychain or Android Keystore, and the Owner's Costco password is not stored anywhere by the app or sent to its server (NFR-01, NFR-02).
- **Given** the in-app browser shows Costco's sign-in page, **then** the app injects no scripts into that page and doesn't read what is typed into it.
- **Given** sign-in fails or is cancelled, **then** no session is kept and the Owner is told that the fallbacks (US-IMP-03, US-IMP-04) are still available.

#### US-IMP-02 · Sync my receipts automatically · Must

As the Owner, I want my online orders and warehouse receipts pulled from my Costco account on their own, so that every purchase is tracked without any typing or sharing.

- **Given** a Costco connection, **when** the app is opened, pulled to refresh, or woken for background refresh by the phone, **then** it reads the account's order and receipt history and creates one purchase per new line item with item number, description, quantity, unit price paid, purchase date, channel, and the order number (online) or warehouse number and receipt identifier (warehouse).
- **Given** the first sync after connecting, **when** it runs, **then** it covers at least the configured window length back from today, so every purchase still eligible for an adjustment is tracked.
- **Given** an online order, **then** the purchase date is the order date, not the delivery date (BR-1).
- **Given** a discount or instant-savings line tied to an item, **when** it is synced, **then** it is applied to that item's price paid instead of becoming its own purchase.
- **Given** a receipt that shows payment card digits (even masked), **when** it is synced, **then** no card digits are kept (NFR-03).
- **Given** a sync, **when** it finishes, **then** only the purchase fields listed above reach the app's server; the Costco session and the raw pages it read stay on the phone (NFR-04).

#### US-IMP-03 · Share a receipt PDF as a fallback · Must

As the Owner, I want to share a warehouse receipt PDF from the Costco app into this app, so that I can log a trip myself whenever I prefer to or sync isn't working.

- **Given** the Owner is signed in to the app on iOS or Android, **when** they share a receipt PDF from the Costco app through the system share sheet, **then** this app appears as a share target and the import starts without any further form to fill in (see OQ-09).
- **Given** a receipt PDF saved to the phone's files, **when** the Owner picks it from inside the app, **then** it is imported the same way.
- **Given** a valid receipt PDF, **when** it is parsed successfully, **then** purchases are created exactly as in US-IMP-02, with channel `warehouse`.
- **Given** a file that is not a PDF, exceeds the size or page limits, or fails parsing, **when** it is shared or picked, **then** the Owner sees a clear message and the file goes to the review queue or is rejected as described in NFR-05 and US-IMP-06.

#### US-IMP-04 · Enter a purchase by hand · Must

As the Owner, I want to enter a purchase manually, so that I can track paper receipts, anything an import missed, or everything if automation stops working.

- **Given** the manual entry form, **when** the Owner submits item number, description, price paid, quantity, purchase date and channel (and warehouse number for `warehouse`), **then** a purchase is created and its window starts on the purchase date.
- **Given** a required field is missing or invalid (for example a negative price or a purchase date in the future), **when** the form is submitted, **then** it is rejected with a field-level message and nothing is saved.
- **Given** a purchase date older than the window length, **when** the form is submitted, **then** the purchase is saved as expired and the Owner is told no claim is possible.
- **Given** no Costco connection, **then** every feature other than sync and automatic price checks still works.

#### US-IMP-05 · Detect duplicate purchases · Must

As the Owner, I want the app to recognize a purchase it already has, however it arrived, so that I never get double-counted purchases or duplicate alerts.

- **Given** an online order already tracked, **when** sync, a shared PDF or a manual entry brings in the same order number, **then** no new purchases are created.
- **Given** a warehouse receipt already tracked, **when** it arrives again by sync or by sharing, **then** no new purchases are created; the receipt is identified by its transaction identifier (exact fields confirmed in Design, see OQ-03), and a shared file also by its hash.
- **Given** a manual entry that matches an existing purchase on item number, purchase date, price paid and channel, **when** it is submitted, **then** the Owner is warned and must confirm before it is saved.

#### US-IMP-06 · Never lose a purchase that fails to parse · Must

As the Owner, I want anything the app can't fully read to land in a review queue, so that a purchase is never silently dropped.

- **Given** a synced receipt or shared PDF that fails parsing entirely, **when** processing finishes, **then** a review-queue entry is created with the reason, the parser version, and the date, and the Owner is notified.
- **Given** a receipt where some lines parse and some don't, **when** processing finishes, **then** the parsed lines are saved as purchases and each unparsed line appears in the review queue.
- **Given** a review-queue entry, **when** the Owner opens it, **then** they can complete it as a manual entry (US-IMP-04) or dismiss it, and the entry is closed either way.
- **Given** any synced receipt or shared PDF, **when** processing ends, **then** it has produced at least one purchase, a duplicate notice, or a review-queue entry (NFR-15).

#### US-IMP-07 · Correct or remove a purchase · Should

As the Owner, I want to edit or delete a purchase, so that a misread price or a returned item doesn't produce a wrong alert.

- **Given** an existing purchase, **when** the Owner edits its price paid, quantity or date, **then** its window and any open alerts are recalculated.
- **Given** an existing purchase with no claim in progress, **when** the Owner deletes it, **then** it no longer appears in tracking or alerts, and a later sync doesn't bring it back.
- **Given** a purchase with a claim marked `claimed` or `refunded`, **when** the Owner tries to delete it, **then** the app asks for confirmation and keeps the savings-log entry.

### 3.2 TRK — Tracking

#### US-TRK-01 · See days left in each item's window · Must

As the Owner, I want to see how many days are left to claim each item, so that I know what's still worth watching.

- **Given** a purchase dated D and a configured window of N days, **when** the Owner views it, **then** the last eligible date is D + N days and the days left are shown counting down to it (inclusive or exclusive counting confirmed by OQ-04).
- **Given** today is after the last eligible date, **when** the Owner views the purchase, **then** it shows as expired and is excluded from price checks and alerts.
- **Given** the configured window length changes, **when** the server restarts, **then** every open purchase's last eligible date is recalculated from the new value without a code change (BR-7).

#### US-TRK-02 · Record and respect the purchase channel · Must

As the Owner, I want every purchase tagged as warehouse or online, so that prices are only compared within the same channel and the right claim path is shown.

- **Given** a purchase from sync, **then** its channel comes from the source (online order or warehouse receipt); from a shared PDF, `warehouse`; from manual entry, the channel the Owner chose.
- **Given** a warehouse purchase and an online current price for the same item, **when** prices are compared, **then** no alert is raised (BR-3).

#### US-TRK-03 · Exclude ineligible items · Must

As the Owner, I want items Costco won't adjust to be marked as excluded, so that I don't get alerts I can't claim.

- **Given** an exclusions list in configuration (item numbers and description keywords, for example precious metals), **when** a matching purchase arrives, **then** it is marked excluded with the reason (BR-6).
- **Given** any purchase, **when** the Owner marks it excluded or un-excluded by hand, **then** the change is saved and price checks and alerts follow the new state.
- **Given** an excluded purchase, **then** it is not price-checked and no alert is sent for it.

#### US-TRK-04 · Home screen of open windows · Should

As the Owner, I want a single list of everything still in its window, sorted by days left, so that I can see what's closing soonest at a glance.

- **Given** open, expired and excluded purchases, **when** the Owner opens the app's home screen, **then** open purchases are listed by fewest days left first, and expired and excluded items are hidden by default but available through a filter.
- **Given** a purchase with a flagged price drop, **when** the home screen is shown, **then** that row is marked and opens its claim card when tapped.

### 3.3 PRC — Prices

#### US-PRC-01 · Check prices automatically · Must

As the Owner, I want the app to check Costco's current price for everything I bought that's still in its window, so that I never have to look for sales myself.

- **Given** an open, non-excluded purchase, **when** the scheduled price check runs, **then** the current Costco price for that item in the purchase's channel is checked at least once every 24 hours, and the result is saved to the item's price history with the source `automatic` and the time checked.
- **Given** a `warehouse` purchase, **when** it is checked, **then** the price comes from the Warehouse Savings listing for the Owner's warehouse (see OQ-05).
- **Given** a checked price lower than the unit price paid, **when** it is saved, **then** the purchase is flagged and an alert is triggered (US-ALR-01), including the sale end date when the page shows one (BR-5).
- **Given** an item whose price can't be found for its channel (for example a warehouse-only price, see OQ-05), **when** the check runs, **then** the item is marked "not checked automatically" on its detail screen, and the Owner can still enter a price by hand (US-PRC-02).
- **Given** a price check, **then** it compares only Costco's own price for the same item (BR-2) and never bypasses a bot check or verification challenge; if one appears, the check stops and the health alert in US-ALR-03 is raised.

#### US-PRC-02 · Enter a current price by hand · Must

As the Owner, I want to record a sale price I've spotted myself, so that I can catch drops the automatic checks miss.

- **Given** the price entry form, **when** the Owner submits item number, channel, current price, the date seen, and optionally the sale end date, **then** the price is saved with the source `manual` and immediately compared with every open purchase of that item number in that channel.
- **Given** a current price lower than the unit price paid on an open, non-excluded purchase, **when** it is saved, **then** that purchase is flagged and an alert is triggered (US-ALR-01).
- **Given** a current price equal to or higher than the price paid, **when** it is saved, **then** nothing is flagged.

#### US-PRC-03 · Keep a price history per item · Should

As the Owner, I want to see every price recorded for an item, so that I can judge how often it goes on sale and back up a claim.

- **Given** several prices recorded for one item, **when** the Owner views that item, **then** all prices are listed with channel, source, date and sale end date, newest first.
- **Given** a new price, **when** it is saved, **then** earlier entries are kept, not overwritten; repeated automatic checks with no change are collapsed into one entry with a first-seen and last-seen date.

#### US-PRC-04 · Respect promotional quantity limits · Could

As the Owner, I want a sale's per-member quantity limit taken into account, so that the claim card doesn't overstate what I can recover.

- **Given** a current price with a quantity limit L (entered by hand or shown on the product page), **when** a purchase of quantity Q is flagged, **then** the claim amount uses min(Q, L) units (see OQ-06).

### 3.4 ALR — Alerts

#### US-ALR-01 · Tell me when a price drops, in the app and on my lock screen · Must

As the Owner, I want a price drop to show up both inside the app and as a notification banner, so that I see it right away and can find it again later.

- **Given** a purchase flagged by a new lower price, **when** the flag is created, **then** within 15 minutes a push notification banner appears on the Owner's phone showing the item description and the amount saved, and tapping it opens the claim card (BR-5).
- **Given** the same flag, **when** the Owner next opens the app, **then** the item appears in a "Price drops" list on the home screen with an unread badge until the Owner opens it, and the app icon shows a badge count of unread price drops where the platform supports it.
- **Given** the app is opened for the first time after sign-in, **when** it asks for notification permission and the Owner allows it, **then** the phone is registered for push notifications.
- **Given** push permission is off or the push service reports the phone unreachable, **when** an alert is due, **then** the same alert is sent by email instead, with a link that opens the claim card, and it still appears in the in-app list.
- **Given** a purchase already alerted for a price, **when** the same or a higher price is recorded again, **then** no duplicate alert is sent; a lower price sends a new alert.
- **Given** any alert is built, **then** the notification contains no full receipt contents, card data, membership number or order number (NFR-14).

#### US-ALR-02 · Remind me before a window closes · Must

As the Owner, I want a reminder a few days before an item's window ends, so that I can check it in person if the automatic checks can't see its price.

- **Given** an open, non-excluded purchase whose last eligible date is a configurable number of days away (default 3), **when** the daily reminder job runs, **then** the Owner receives one notification summarizing them, which opens a list of every such purchase, with items not checked automatically listed first.
- **Given** no purchases meet the condition, **when** the job runs, **then** no notification is sent.
- **Given** the job missed a day, **when** it next runs, **then** it includes the purchases it would have listed.

#### US-ALR-03 · Tell me when automation stops working · Must

As the Owner, I want to know when sync or price checks fail, so that I can reconnect or switch to the fallbacks before I miss a claim.

- **Given** the Costco session has expired or been signed out by Costco, **when** the next sync tries to run, **then** the Owner is notified within 24 hours and the home screen shows a "Reconnect Costco" banner until they reconnect or dismiss it.
- **Given** sync or price checks fail for a configured number of runs in a row (default 3), or Costco shows a bot check or verification challenge, **when** the threshold is reached, **then** the Owner is notified once with the reason, and the home screen offers the fallbacks: share a receipt PDF or enter purchases and prices by hand.
- **Given** a later sync or check succeeds, **then** the banner clears on its own.

### 3.5 CLM — Claims

#### US-CLM-01 · Show a claim card · Must

As the Owner, I want a screen I can show at the counter or use online with everything needed for the claim, so that the adjustment takes as little time as possible.

- **Given** a flagged purchase, **when** the Owner opens its claim card, **then** it shows item number, description, purchase date, channel, warehouse number or order number, quantity, price paid, current price and where it was seen, refund due (difference × eligible quantity), sale end date if known, and last eligible date.
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

#### US-ACC-01 · Sign in to a single app account · Must

As the Owner, I want to sign in to the app with a password, so that only I can see my purchases.

- **Given** the server has no account, **when** it is first set up, **then** exactly one app account is created through a one-time setup step or command, and public sign-up is not available (Phase 2).
- **Given** correct credentials, **when** the Owner signs in, **then** a session starts; **given** wrong credentials, **then** a generic error is shown that doesn't reveal which field was wrong.
- **Given** repeated failed sign-ins, **when** the limit in NFR-09 is reached, **then** further attempts are blocked for the lockout period.
- **Given** the app is opened, **when** there is no valid session, **then** the sign-in screen is shown and no purchase data is displayed.
- **Given** the Owner signs out, **then** app session tokens, the Costco session and cached purchase data are deleted from the phone, and the app session is revoked on the server.

#### US-ACC-02 · Keep every record scoped to its owner · Must (multi-user foundation)

As the Owner, I want every record tied to my account, so that other members can be added in Phase 2 without anyone seeing my data.

- **Given** any stored purchase, price check, alert, claim or import, **then** it carries the owning user's ID, except shared reference data such as the exclusions list and public product prices.
- **Given** two accounts created in a test, **when** account A requests any record belonging to B by ID, **then** the app responds as if the record doesn't exist.
- **Given** a new account is created, **then** automated sync and price checks are off for it until enabled in server configuration (FR-31).

#### US-ACC-03 · Disconnect my Costco account · Must

As the Owner, I want to disconnect Costco from the app at any time, so that I stay in control of the connection.

- **Given** a Costco connection, **when** the Owner disconnects it in settings, **then** the Costco session is deleted from the phone and sync stops; price checks for purchases already tracked continue.
- **Given** the disconnect screen, **then** the Owner can also choose to delete every synced purchase from the server, and after confirming, those purchases and their price history are deleted.

## 4. Functional requirements

| ID | The system shall… | Stories |
| --- | --- | --- |
| FR-01 | Provide a Costco connection screen that opens Costco's own sign-in page in an in-app browser, keeps only the resulting session in the iOS Keychain or Android Keystore, and injects no scripts into or reads no input from the sign-in page. | US-IMP-01 |
| FR-02 | Let the Owner disconnect the Costco account, deleting the session from the phone and stopping sync, and optionally delete every synced purchase from the server. | US-ACC-03 |
| FR-03 | Sync the Costco account's online order and warehouse receipt history from the phone on app open, on pull to refresh, and during background refresh when the operating system allows it; the first sync covers at least the configured window length. | US-IMP-02 |
| FR-04 | Turn each synced or shared receipt into one purchase per line item (item number, description, quantity, unit price paid, purchase date, channel, and order number or warehouse number and receipt identifier), discarding any payment card digits. | US-IMP-02, US-IMP-03 |
| FR-05 | Apply discount and instant-savings lines to the price paid of the item they belong to. | US-IMP-02, US-IMP-03 |
| FR-06 | Accept a receipt PDF through the iOS and Android share sheet and an in-app file picker. | US-IMP-03 |
| FR-07 | Provide a manual purchase form with validation of required fields, non-negative prices and non-future dates. | US-IMP-04 |
| FR-08 | Detect duplicate purchases across sync, shared PDFs and manual entry by order number, receipt transaction identifier and file hash, and warn on manual entries matching an existing purchase. | US-IMP-05 |
| FR-09 | Place any synced receipt, shared PDF or line that fails parsing in a review queue with reason, parser version and date, and notify the Owner. | US-IMP-06 |
| FR-10 | Let the Owner resolve a review-queue entry as a manual purchase or dismiss it. | US-IMP-06 |
| FR-11 | Let the Owner edit and delete purchases, recalculating windows and alerts, keeping savings-log entries for claimed or refunded purchases, and never re-creating a deleted purchase on a later sync. | US-IMP-07 |
| FR-12 | Calculate each purchase's last eligible date as purchase date plus the configured window length, and mark purchases past that date as expired. | US-TRK-01 |
| FR-13 | Store a channel on every purchase and every recorded price, and compare prices only within the same channel. | US-TRK-02, US-PRC-01, US-PRC-02 |
| FR-14 | Mark purchases as excluded automatically from a configured exclusions list, let the Owner set or clear the flag by hand, and skip excluded purchases in price checks and alerts. | US-TRK-03 |
| FR-15 | Show a home screen of open purchases sorted by days left, with filters for expired and excluded items, a marker on flagged items, a "Price drops" list with unread badges, and health banners. | US-TRK-04, US-ALR-01, US-ALR-03 |
| FR-16 | Check the current Costco price of every open, non-excluded purchase in its channel at least once every 24 hours, record each result with the source `automatic`, and mark items whose price can't be found as not checked automatically. | US-PRC-01 |
| FR-17 | Provide a manual current-price form (item number, channel, price, date seen, optional sale end date, optional quantity limit), record entries with the source `manual`, and keep every recorded price as history. | US-PRC-02, US-PRC-03, US-PRC-04 |
| FR-18 | On each new recorded price, automatic or manual, flag every open, non-excluded purchase of that item and channel whose unit price paid is higher. | US-PRC-01, US-PRC-02 |
| FR-19 | For each new flag, send a push notification banner with the item and amount saved, add the item to the in-app "Price drops" list and the app icon badge, send by email instead when push is off or fails, and alert once per purchase per lower price. | US-ALR-01 |
| FR-20 | Run a daily job that sends one notification summarizing open, non-excluded purchases whose last eligible date is within the configured reminder lead time, listing items not checked automatically first, and catching up after a missed run. | US-ALR-02 |
| FR-21 | Detect an expired Costco session, repeated sync or price-check failures, and bot checks or verification challenges; stop automated access when a challenge appears; notify the Owner; and show a health banner with reconnect and fallback options until a later run succeeds. | US-ALR-03, US-PRC-01 |
| FR-22 | Generate a claim card with the fields and channel-specific claim path in US-CLM-01. | US-CLM-01 |
| FR-23 | Cache claim cards for flagged purchases on the phone so they open without a connection, showing when each was last synced. | US-CLM-01 |
| FR-24 | Track claim status through flagged, claimed, refunded, denied and dismissed, enforce the allowed moves, and record the date of each change. | US-CLM-02 |
| FR-25 | Show a savings log with per-claim entries, all-time and monthly totals, and alert accuracy. | US-CLM-03 |
| FR-26 | Provide password sign-in for a single app account created through a one-time setup step, with no public sign-up. | US-ACC-01 |
| FR-27 | Require a valid access token on every API call other than sign-in, and show the sign-in screen when the app has no valid session. | US-ACC-01 |
| FR-28 | Store the owning user ID on every user record and filter every read and write by the signed-in user's ID. | US-ACC-02 |
| FR-29 | Register the phone for push notifications after the Owner grants permission, and remove the registration on sign-out. | US-ALR-01, US-ACC-01 |
| FR-30 | On sign-out, delete app session tokens, the Costco session and cached purchase data from the phone, and revoke the app session on the server. | US-ACC-01 |
| FR-31 | Let automated sources (sync and automatic price checks) be switched on or off per account in server configuration, with every new account starting with them off. | US-IMP-01, US-ACC-02 |

## 5. Non-functional requirements

| ID | Category | Requirement | Target or test | Traces to |
| --- | --- | --- | --- | --- |
| NFR-01 | Security | The Owner's Costco password is never stored, logged or sent to the app's server, and the server never logs in to Costco. | Network inspection during sign-in shows no password in traffic to the app's server; code review checklist item; no server code path or config field for Costco credentials. | Charter scope (out of scope); risk "The Costco session stored on the phone is stolen or misused" |
| NFR-02 | Security | The Costco session (cookies or tokens) stays on the phone, only in the iOS Keychain or Android Keystore, and never appears in logs, backups to the app's server, or crash reports. | Device storage review against MASVS; log and crash-report scan in Testing. | Risk "The Costco session stored on the phone is stolen or misused" |
| NFR-03 | Security | No payment card numbers are stored. Card digits on a receipt (even masked) are discarded during parsing. | Fixture test: parsed output of a fake receipt containing masked card digits has no card field or value. | Charter constraints |
| NFR-04 | Privacy | Only the purchase fields listed in FR-04 reach the app's server. Raw account pages read during sync are parsed on the phone and never uploaded. | Contract test on the upload payload schema; network inspection during sync. | Risk "Receipt data leaks" |
| NFR-05 | Security | Shared or picked files must be PDFs (checked by content, not extension), at most 5 MB and 10 pages, and are parsed in an isolated process with a 10-second time limit, no network access, and no execution of embedded scripts or attachments. Pages read during sync and price checks are parsed as data; no links in them are followed beyond the order, receipt and product pages the app needs. | Tests with oversized, renamed, malformed and script-bearing fake files. | Risk "Spoofed or malicious inbound emails and PDFs" |
| NFR-06 | Security | Secrets (keys, push and email credentials) live only in environment configuration. `.env` files are never committed and secret scanning runs on the repository. | Secret scan passes on every commit; `.env.example` holds placeholders only. | Charter vision ("secrets in configuration"); README principles |
| NFR-07 | Security | The backend API meets OWASP Application Security Verification Standard (ASVS) Level 1, and the phone app meets the OWASP Mobile Application Security Verification Standard (MASVS) baseline (MAS-L1 testing profile). | ASVS L1 and MASVS checklists completed in the Testing phase with every item passed or justified as not applicable. | Charter risks; README principles |
| NFR-08 | Security | All API traffic uses TLS 1.2 or later, and the app refuses plain HTTP. App access tokens are short-lived (15 minutes) with rotating refresh tokens that the server can revoke, kept only in the Keychain or Keystore. | Automated tests for token expiry, refresh rotation and revocation; storage review against MASVS. | US-ACC-01 |
| NFR-09 | Security | App account passwords are hashed with Argon2id or bcrypt. Sign-in is limited to 5 failed attempts per 15 minutes before a temporary lockout. | Unit tests for hashing and lockout. | US-ACC-01 |
| NFR-10 | Security / Privacy | Every read and write is scoped to the signed-in user (least privilege). | Two-account authorization tests on every endpoint return "not found" for another user's records. | US-ACC-02; charter vision |
| NFR-11 | Privacy | Purchase data, prices, claims and stored import files are encrypted at rest on the server. Data cached on the phone uses the platform's encrypted storage (iOS Data Protection, Android encrypted storage). | Server encryption settings documented in Design and verified at deployment; device storage reviewed against MASVS. | Risk "Receipt data leaks" |
| NFR-12 | Privacy | No real receipts, account pages or personal data are committed. Test fixtures use invented data only, modeled on real structure. | Pre-commit PII scan; fixture review in every PR touching parsers. | Charter risks; README principles |
| NFR-13 | Privacy | Shared PDFs are deleted once their items are imported or resolved from the review queue, or after 30 days, whichever comes first. Logs never contain receipt contents, passwords, or app or Costco session tokens. | Retention job test; log review in Testing. | Risk "Receipt data leaks" |
| NFR-14 | Privacy | Notification banners and email alerts show only the item description and the amount saved: no receipt contents, card data, membership number or order number. Details load after the app opens and the session is checked. | Payload fixture test. | Risk "Purchase details appear in lock-screen notifications" |
| NFR-15 | Reliability | No purchase is silently dropped. Every synced receipt or shared PDF ends as tracked purchases, a duplicate notice, or a review-queue entry. | 100% of fixture imports, including malformed ones, end in one of those three states. | Risk "Costco changes its site or blocks automated access" |
| NFR-16 | Reliability | Sync, imports and price checks are idempotent: re-running them never creates duplicate purchases, prices or alerts. Scheduled jobs catch up after a missed run. | Replay tests; skipped-day test for reminders. | US-IMP-05; US-ALR-02 |
| NFR-17 | Reliability | A purchase appears in the app within 24 hours of appearing in the Costco account when the phone is online and background refresh is allowed, and within 60 seconds of opening the app. | Measured over the first month of use (background limits per platform in OQ-11). | Charter goal "Low effort" |
| NFR-18 | Reliability | Every open, non-excluded purchase is price-checked at least once every 24 hours, and price-drop alerts are handed to the push service (or email) within 15 minutes of the drop being recorded. | Job logs reviewed in Testing; alert latency measured. | Charter goal "No missed windows"; BR-5 |
| NFR-19 | Reliability | A broken sync or price check (expired session, repeated failures, bot check) is detected and reported to the Owner within 24 hours. | Fault-injection tests for each failure type. | Risk "Costco changes its site or blocks automated access" |
| NFR-20 | Reliability | The database is backed up daily, and a restore is tested once before the end of Phase 1. | Backup schedule in Design; restore drill recorded. | Charter goal "Recover money" |
| NFR-21 | Compliance | Automated sync and price checks run only for the Owner's own account, for personal use (OQ-02), and stay at personal-use volumes: by default no more than one account sync per hour and one price check per item per day, with backoff after errors. The app never solves, bypasses or works around bot checks or verification challenges; it stops and alerts the Owner instead. | Rate limits enforced in code and covered by tests; challenge-handling test. | Risk "Automated access conflicts with Costco's terms of use" |
| NFR-22 | Maintainability | Business rules and limits (window length, exclusions list, reminder lead time, failure threshold, sync and price-check rates) are configuration, not code. | Changing each value changes behavior with no code change (test). | BR-6, BR-7 |
| NFR-23 | Maintainability | Parsers for account pages, receipt PDFs and product pages are versioned. Each version has fixture tests with fake data, and every import and price check records the parser version used. | Parser test suite runs in CI; version stored on each record. | Risk "Costco changes its site or blocks automated access" |
| NFR-24 | Maintainability | Business-rule logic (windows, comparisons, claim amounts, status changes) is separate from the UI and has at least 90% branch coverage. | Coverage report in CI. | Charter vision ("business rules out of the UI") |
| NFR-25 | Maintainability | Purchase sources (sync, shared PDF, manual) and price sources (automatic, manual) sit behind common interfaces, so a broken source can be fixed or replaced without changing the rest of the app. | Each source has its own module and contract tests. | Risks "Costco changes its site or blocks automated access" and "Automatic price checks miss warehouse-only prices" |
| NFR-26 | Usability | Synced purchases need no action from the Owner. Logging one receipt through a fallback takes under 2 minutes. | Median under 2 minutes for shared PDFs over the first month, timed from opening the receipt in the Costco app to purchases saved. | Charter goal "Low effort" |
| NFR-27 | Usability | The app supports the current and previous major versions of iOS and Android. Every screen works without horizontal scrolling on screens from 360 dp (Android) or 375 pt (iPhone) wide and up, including with larger system text sizes. | Checked on the smallest supported screen of each platform in Testing. | US-CLM-01; US-IMP-03 |
| NFR-28 | Cost | Phase 1 hosting, push, email and storage run at low or zero cost, preferring free tiers. Any paid service is recorded as a Design decision with its monthly cost. App store developer account fees are the expected fixed cost. | Monthly cost reviewed at the end of Phase 1 (ceiling set in OQ-07). | Charter constraints |
| NFR-29 | Compliance | The app uses a generic name and shows that it is not affiliated with Costco. | Disclaimer visible on the sign-in screen, the app's About screen and the README. | Risks "Using the Costco name or logo implies endorsement" and "App store review rejects the app" |
| NFR-30 | Portability | The iOS and Android apps come from one cross-platform codebase (framework chosen in Design). Phase 1 builds are distributed through TestFlight and Google Play internal testing. | Both builds installable from their test tracks by the end of Phase 1. | Charter vision (phone app); charter scope (test-track install) |

## 6. Business rules

The business rules are defined in the charter's [business rules](project-charter.md#business-rules) section and are not repeated here. This table shows where each one is enforced.

| Rule | Enforced by |
| --- | --- |
| BR-1 Window starts at the purchase date | US-IMP-02, US-IMP-04, US-TRK-01 · FR-04, FR-12 |
| BR-2 Only Costco's own lower price counts | US-PRC-01, US-PRC-02 · FR-16, FR-17, FR-18 (prices come only from Costco or the Owner, per item and channel) |
| BR-3 Warehouse and online are separate channels | US-TRK-02 · FR-13 |
| BR-4 Claim path differs by channel | US-CLM-01 · FR-22 |
| BR-5 Claims may be refused after a sale ends | US-PRC-01, US-ALR-01 · FR-16, FR-19, NFR-18 |
| BR-6 Some items and buyers are excluded | US-TRK-03 · FR-14, NFR-22 |
| BR-7 Costco may change the policy | US-TRK-01 · NFR-22 |
| BR-8 Refunds take time; status is tracked | US-CLM-02 · FR-24 |

A check of the rules against Costco's official policy turned up possible additions and refinements. They are recorded in OQ-01 and OQ-06 rather than applied, because the charter is the source of truth for rules.

## 7. MVP definition

Phase 1 ships when all 20 Must-have stories pass their acceptance criteria and every NFR in section 5 is met or has a recorded, justified exception.

**Must-have stories (Phase 1 MVP)**

| Epic | Stories |
| --- | --- |
| Import | US-IMP-01, US-IMP-02, US-IMP-03, US-IMP-04, US-IMP-05, US-IMP-06 |
| Tracking | US-TRK-01, US-TRK-02, US-TRK-03 |
| Prices | US-PRC-01, US-PRC-02 |
| Alerts | US-ALR-01, US-ALR-02, US-ALR-03 |
| Claims | US-CLM-01, US-CLM-02, US-CLM-03 |
| Accounts | US-ACC-01, US-ACC-02, US-ACC-03 |

**Should and Could (built in Phase 1 if time allows, in this order):** US-TRK-04, US-IMP-07, US-PRC-03, US-PRC-04.

**Deferred to Phase 2 (Won't have in the MVP)**, as set by the charter:

- Importing online orders from forwarded Costco.com confirmation emails, and an optional read-only Gmail connection
- Receipt photo import with OCR for paper receipts
- Import prompts triggered by a linked card transaction feed (investigation only)
- Open sign-up and multiple accounts
- Automated sync and price checks for any account other than the owner's (only with Costco's written permission, see OQ-13)
- Community-reported sale prices
- Importing prices from the monthly savings book (investigation only)
- Public listing in the App Store and Google Play

**Out of scope entirely**, as set by the charter: storing members' Costco passwords, logging in to Costco from the app's server, filing adjustments on the member's behalf, and non-Costco retailers.

## 8. Traceability matrix

Every charter scope item, goal, constraint and risk that the MVP addresses, mapped to the stories and requirements that satisfy it.

| Charter item | Stories | FRs | NFRs |
| --- | --- | --- | --- |
| Scope: automatic receipt sync through a sign-in on the phone | US-IMP-01, US-IMP-02, US-ACC-03 | FR-01 to FR-05 | NFR-01, NFR-02, NFR-04, NFR-17, NFR-21 |
| Scope: share a receipt PDF (fallback) | US-IMP-03 | FR-04 to FR-06 | NFR-05, NFR-26 |
| Scope: manual purchase entry (fallback) | US-IMP-04, US-IMP-07 | FR-07, FR-11 | — |
| Scope: alert when sync or price checks stop, or the session expires | US-ALR-03 | FR-15, FR-21 | NFR-19 |
| Scope: countdown of days left per window | US-TRK-01, US-TRK-04 | FR-12, FR-15 | NFR-22, NFR-24 |
| Scope: automatic price checks | US-PRC-01 | FR-16, FR-18 | NFR-18, NFR-21, NFR-25 |
| Scope: manual current-price entry (fallback) | US-PRC-02, US-PRC-03, US-PRC-04 | FR-13, FR-17, FR-18 | NFR-24 |
| Scope: price-drop alerts in the app and as a notification banner, email fallback | US-ALR-01, US-ALR-02 | FR-15, FR-19, FR-20, FR-29 | NFR-14, NFR-18 |
| Scope: claim card | US-CLM-01 | FR-22, FR-23 | NFR-27 |
| Scope: log of claims and dollars recovered | US-CLM-02, US-CLM-03 | FR-24, FR-25 | — |
| Scope: user accounts and authentication (single account) | US-ACC-01, US-ACC-02 | FR-26 to FR-28, FR-30 | NFR-08, NFR-09, NFR-10 |
| Scope: iOS and Android app installed through test tracks | US-IMP-03, US-CLM-01 | FR-06, FR-23 | NFR-27, NFR-30 |
| Scope (out): no stored Costco passwords, no server-side Costco login | — | — | NFR-01, NFR-02 |
| Rules BR-1 to BR-8 | See [section 6](#6-business-rules) | FR-04, FR-12 to FR-14, FR-16 to FR-19, FR-22, FR-24 | NFR-18, NFR-22 |
| Goal: recover money | US-PRC-01, US-ALR-01, US-CLM-01, US-CLM-03 | FR-16, FR-18, FR-19, FR-22, FR-25 | NFR-20 |
| Goal: low effort | US-IMP-01, US-IMP-02, US-PRC-01 | FR-01, FR-03, FR-16 | NFR-17, NFR-26 |
| Goal: trustworthy alerts (90% claimable) | US-IMP-05, US-TRK-02, US-TRK-03, US-CLM-02, US-CLM-03 | FR-08, FR-13, FR-14, FR-24, FR-25 | NFR-16 |
| Goal: no missed windows | US-ALR-02, US-ALR-03, US-IMP-06 | FR-09, FR-20, FR-21 | NFR-15, NFR-18, NFR-19 |
| Goal: resume-ready repo | — | — | NFR-12, NFR-23, NFR-24 |
| Vision: multi-user foundation | US-ACC-02 | FR-28 | NFR-10 |
| Constraint: no card numbers or Costco passwords stored | — | — | NFR-01, NFR-03 |
| Constraint: low or zero hosting cost | — | — | NFR-28 |
| Risk: Costco changes its site or blocks automated access | US-IMP-03, US-IMP-04, US-IMP-06, US-PRC-02, US-ALR-03 | FR-06, FR-07, FR-09, FR-10, FR-17, FR-21 | NFR-15, NFR-19, NFR-23, NFR-25 |
| Risk: automated access conflicts with Costco's terms of use | US-IMP-01, US-PRC-01, US-ALR-03, US-ACC-02 | FR-21, FR-31 | NFR-21 (decision in OQ-02) |
| Risk: automatic price checks miss warehouse-only prices | US-PRC-01, US-PRC-02, US-ALR-02 | FR-16, FR-17, FR-20 | NFR-25 (and OQ-05) |
| Risk: the Costco session on the phone is stolen or misused | US-IMP-01, US-ACC-01, US-ACC-03 | FR-01, FR-02, FR-30 | NFR-01, NFR-02, NFR-08 |
| Risk: spoofed or malicious PDFs | US-IMP-03, US-IMP-06 | FR-06, FR-09 | NFR-05 |
| Risk: receipt data leaks | US-ACC-01, US-ACC-02 | FR-27, FR-28 | NFR-04, NFR-06 to NFR-13 |
| Risk: Costco changes the policy | US-TRK-01, US-TRK-03 | FR-12, FR-14 | NFR-22 |
| Risk: implied endorsement | — | — | NFR-29 |
| Risk: app store review rejects the app | — | — | NFR-29, NFR-30 |
| Risk: purchase details in lock-screen notifications | US-ALR-01 | FR-19 | NFR-14 |

## 9. Open questions

| ID | Question | Owner | Blocks | Notes |
| --- | --- | --- | --- | --- |
| OQ-01 | Do the charter's rules BR-1 to BR-8 match Costco's official price adjustment policy? | Project owner | Design | See findings below. The official page couldn't be read automatically, so it needs a manual check. |
| OQ-02 | Do Costco's terms of use allow a member's own app to read their order history and Costco's product pages automatically, and does that change for multiple users or a paid product? | Project owner | **Resolved Oct 21, 2026** | No. The Site Terms prohibit it without written consent (findings below). Decision: automation for the owner's own account and personal use only. Recheck the terms at the start of each phase. |
| OQ-03 | What is the exact structure of the Costco account's order and warehouse receipt pages, the receipt PDF, and a product page, including the fields that identify a receipt uniquely? | Project owner | Design (parser design and duplicate key) | In the Costco app, receipts are under Account → Orders & Purchases → Warehouse tab (online orders on the neighboring tab); confirm the equivalent pages on costco.com, which the in-app browser uses. Inspect real examples locally. **Never commit real pages, receipts or screenshots.** Build invented fixtures with the same structure. |
| OQ-04 | Is day 30 itself eligible (inclusive counting), and whose time zone defines "today" for the warehouse channel? | Project owner | Design | Affects FR-12 and the countdown. Confirm at a warehouse counter or with Costco customer service. |
| OQ-05 | Can warehouse prices be seen online, and do warehouse receipt item numbers match costco.com item numbers? | Project owner | Design | **Partly answered Oct 21, 2026:** current warehouse deals are listed in the Costco app under Warehouse → Warehouse Savings. Still open: whether the same listing is reachable on costco.com, whether it is specific to the selected warehouse, and whether its item numbers match warehouse receipts. Items not covered rely on US-PRC-02 and the reminder in US-ALR-02. |
| OQ-06 | Should the charter add rules for promotional quantity limits and for claiming promotional items within the promotion dates? | Project owner | Implementation of US-PRC-04 | Secondary sources quote the official policy on both points (see findings). Requires a charter revision, so it's recorded here instead. |
| OQ-07 | What monthly cost ceiling counts as "low" for Phase 1 hosting, push, email and storage? | Project owner | Design | Needed to make NFR-28 measurable. |
| OQ-08 | Should price checks run on the phone or on the server? | Project owner | Design | The server is more reliable on a schedule and needs no Costco session for public product pages; the phone keeps all Costco traffic on the member's own connection. Either way NFR-21 applies. |
| OQ-09 | Can the Costco app share or export a warehouse receipt as a PDF on both iOS and Android, and in what form does it arrive? | Project owner | Design | US-IMP-03 depends on it. Check on both platforms with a real receipt, committing nothing from it. If a platform can't share a PDF, record the gap; manual entry remains. |
| OQ-10 | Which push notification service will the backend use: Apple Push Notification service and Firebase Cloud Messaging directly, or a provider in front of both? | Project owner | Design | Must cover iOS and Android, fit NFR-28, and allow minimal payloads (NFR-14). |
| OQ-11 | How often can each platform run a background sync, and is that enough for NFR-17? | Project owner | Design | iOS schedules background refresh at its own discretion. If background sync is too infrequent, sync on app open and the daily price check carry the load. |
| OQ-12 | Which public sources of Costco sale prices allow reuse, and in what format? | Project owner | Phase 2 | Carried over from the charter. Could fill the warehouse gap in OQ-05 later. |
| OQ-13 | Should Costco be asked for written permission to offer automated sync and price checks to other members, or to monetize the app? | Project owner | Phase 2 sign-up or monetization | Required by Site Terms Sections 4, 5 and 9. Without it, Phase 2 members use the fallbacks only. |

### OQ-02 findings: terms of use

Costco's [Site Terms](https://www.costco.com/f/-/terms-and-conditions-of-use), last updated Oct 7, 2026, reviewed Oct 21, 2026. This is a summary for planning, not legal advice.

| Section | Quote or summary | Requirement impact |
| --- | --- | --- |
| 9, Your Conduct | Prohibits using "any data mining, robots, agents or similar data gathering or extraction methods designed to scrape or extract data from our Services" and developing or using "any applications or software that interact with our Services without our prior written consent" | Sync (US-IMP-02) and automatic price checks (US-PRC-01) conflict; limited to the owner's own account (NFR-21, FR-31) |
| 9, Your Conduct | Prohibits attempts to "bypass or circumvent measures employed to prevent or limit access" | The app stops at any bot check or challenge (US-ALR-03, NFR-21) |
| 4, License | A license "to make only personal use of the Services"; commercial use needs written permission | No monetization of automation without permission (OQ-13) |
| 5, Accounts | "You may not share with or permit others to use your individual account credentials." | Other members can't sign in to Costco through this app without permission (OQ-13) |
| 6, Trademarks | No use of Costco's trademarks without written permission | Generic app name and disclaimer (NFR-29) |
| 16, Termination | Access can be ended "without notice and in its sole discretion" for violations | The owner accepts this risk for their own account |

### OQ-01 findings: policy check

Costco's customer service page for price adjustments ("Price Adjustment - Costco.com Orders", article 628 on customerservice.costco.com) blocks automated reading, so it was checked through secondary sources that quote it. The owner should confirm these points against the live page before Design.

| Point | Charter | What the sources report | Status |
| --- | --- | --- | --- |
| Window | BR-1: 30 days from purchase, not delivery | Quoted as "within 30 days of the date of purchase." Sources say the clock starts at the order date for online orders. | Consistent |
| Competitors | BR-2: Costco's own price only | Quoted as "Costco does not price match with other businesses or retailers." | Consistent |
| Channels | BR-3: warehouse and online are separate | Sources say warehouse and online prices can't be matched against each other. | Consistent |
| Claim path | BR-4: warehouse counter; Costco.com form | Online claims use a "Request a Price Match" option on the Costco.com order; warehouse claims go to the returns counter of the purchase warehouse. | Consistent; the online path is a button on the order, not a separate form |
| Promotional items | BR-5: claims refused once a sale ended (member reports) | Promotional items reportedly must be claimed within both the promotion dates and the 30-day window. | Stronger than the charter states; see OQ-06 |
| Quantity limits | Not covered | Promotional matches reportedly apply only "up to the limit quantity." | Gap; see OQ-06 and US-PRC-04 |
| Exclusions | BR-6: gold bullion as an example; resellers excluded | Precious metals are excluded; reseller accounts get promotional pricing only when buying during the promotion dates. | Mostly consistent; reseller rule is narrower than the charter's wording |
| Discretion | BR-7: Costco may deny or change the policy | Some warehouses reportedly approve requests a few days late at their discretion. | Consistent; the app should not rely on it |
| Refunds | BR-8: online refunds to original payment, 5–10 business days | Same for online; warehouse adjustments are refunded to the original form of payment at the counter. | Consistent |

Sources: [Costco customer service, Price Adjustment - Costco.com Orders](https://customerservice.costco.com/app/answers/detail/a_id/628/~/price-adjustment---costco.com-orders) (not readable automatically), [Thrifle, Aug 2026](https://thrifle.com/blog/costco-price-adjustment), [Priceva, updated Jun 2026](https://priceva.com/blog/costco-price-match).
