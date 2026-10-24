# ADR 0006: Import receipt screenshots with on-device text recognition

**Status:** Accepted · **Date:** Oct 23, 2026 · **Supersedes:** the PDF part of [ADR 0005](0005-parse-costco-documents-on-device.md) · **Resolves:** OQ-09

## Context

The fallback for warehouse receipts was to share the receipt PDF from the Costco app (US-IMP-03). Spike S-1 found that the Costco app's receipt view has no share or download option, so there is no PDF to share. The owner proposed screenshots instead: the receipt is already on screen, and screenshots are easy to take and pick.

A screenshot of the digital receipt is far easier to read than a photo of paper: clean, flat, high-contrast text in a fixed layout. The receipt also prints its own item count, subtotal and instant-savings total, so the app can check every reading (spike S-1, parse checks).

## Decision

Replace the PDF fallback with screenshot import, read entirely on the phone.

- The Owner picks one or more screenshots from the photo library, or shares them to the app.
- The platform's on-device text recognition reads them: Apple Vision on iOS and Google ML Kit on Android, through an Expo-compatible native module chosen in spike S-7. No image or text leaves the phone.
- The app merges overlapping screenshots, removing lines repeated where the receipt was scrolled, and runs the same versioned parsers used for sync.
- If all three parse checks pass, the purchases are saved. If any fails, the Owner sees a correction screen next to the mismatched total and fixes the misread line, or sends the receipt to the review queue.
- After saving, the new purchases are compared with the latest recorded prices so the Owner sees right away if anything is already cheaper (FR-32).
- Screenshots are copied into app-private storage only while needed and deleted once the receipt is imported or resolved; originals in the photo library are untouched.

## Consequences

- The fallback works on both platforms without any cooperation from the Costco app.
- Photos of paper receipts stay in Phase 2. They need the same pipeline plus perspective correction and much messier text, and the parse checks will matter even more there.
- A native text-recognition module means the app needs a development build, not Expo Go, which ADR 0001 already expects for the share-sheet target.
- Recognition errors are caught by the totals rather than trusted (NFR-31). A receipt that is cut off, or missing its totals section, can't pass the checks and goes to correction.

## Alternatives considered

- **Server-side OCR (for example a cloud vision API):** easier to swap engines, but receipts, with card digits and location, would leave the phone, and it adds cost.
- **Manual entry only:** always works but is slow for a full cart, which breaks the charter's "under 2 minutes per receipt" goal.
