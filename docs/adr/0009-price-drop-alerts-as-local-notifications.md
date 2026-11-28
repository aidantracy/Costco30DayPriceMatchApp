# ADR 0009: Price-drop alerts as local notifications on the phone

**Status:** Accepted · **Date:** Nov 27, 2026

## Context

The owner wants a phone notification when something they bought gets cheaper. The API can already send Expo push messages (`app/notify`, `POST /devices`), but on Android, Expo push needs a Firebase project, its config file in the app, and its credentials uploaded to an Expo account.

Since ADR 0007 and 0008, every price that can create a price drop is found on the phone while the app is in use: the costco.com check, Warehouse Savings, receipts and manual entries. The server's daily job doesn't create drops.

## Decision

The app shows price-drop alerts as **local notifications** (`expo-notifications`, already in the app for the Warehouse Savings reminder):

- After a price check, a Warehouse Savings save, a receipt import or a manual purchase that finds a drop, and whenever the app opens, the app loads the drops (`GET /flags`) and posts one notification for each new unread drop. The ids already announced are kept in secure storage, so each drop is announced once.
- For every open drop it schedules a reminder at 10 AM two days before the claim deadline, and cancels it once the drop is claimed, dismissed or past.
- Tapping either opens the drop's claim card. While the app is open, drops go only to the notification list; the app already shows them.
- Sign-out cancels the reminders.

## Consequences

- No Firebase project, Expo account or server change; $0.
- Alerts appear when the app finds a drop, which is when drops are found anyway. A future server-side check (for example, if costco.com ever allows Cloud Run) would need real push; the server pieces for that are still there.
- Claim reminders depend on the phone's schedule being up to date, which it is after any app open.
