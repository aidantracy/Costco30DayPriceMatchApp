# ADR 0005: Parse Costco account pages and receipt PDFs on the phone

**Status:** Accepted; the PDF part is superseded by [ADR 0006](0006-receipt-screenshots-on-device-ocr.md) · **Date:** Oct 21, 2026

## Context

Receipt sync reads the owner's order and receipt history through the Costco session on the phone (FR-03). Shared receipt PDFs arrive on the phone through the share sheet (FR-06). Only the purchase fields in FR-04 may reach the server (NFR-04), the Costco session must never leave the phone (NFR-02), and PDF parsing must be isolated with size, page and time limits (NFR-05).

## Decision

Parse everything that comes from Costco or a shared PDF on the phone, and upload only the extracted purchase fields.

- **Sync:** a hidden `react-native-webview` loads the allowlisted order and receipt pages with the owner's session. A small read-only script, injected only on those allowlisted pages and never on sign-in pages, passes the page's receipt data to the app through the WebView message channel. The app's versioned TypeScript parsers turn it into purchases.
- **PDFs:** a second hidden WebView, loaded with a bundled copy of PDF.js and no network access, extracts the text; the same parsers turn it into purchases. Files over 5 MB or 10 pages are rejected, and parsing stops after 10 seconds.
- Raw pages are never stored. Shared PDFs that fail parsing are kept only on the phone, for the review queue, and deleted after 30 days (NFR-13).

## Consequences

- The server never sees raw receipts, account pages or PDFs, which shrinks the impact of a server breach.
- Parser fixes ship to the phone through EAS Update without a store release.
- Parsers run in TypeScript on the phone, while the price-page parser runs in Python on the server; each language has its own fixture tests (NFR-23).
- The exact page structure, and whether the data arrives as HTML or as JSON loaded by the page, is confirmed in an implementation spike (OQ-03) using real pages inspected locally and never committed.

## Alternatives considered

- **Upload PDFs and parse them on the server:** simpler parsing in Python, but receipts would reach the server, and isolating the parser on Cloud Run is harder.
- **Send the Costco session to the server for syncing:** rejected outright by NFR-02.
