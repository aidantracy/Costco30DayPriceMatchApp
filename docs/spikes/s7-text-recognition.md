# Spike S-7: On-device text recognition for receipt screenshots

**Status:** Library chosen; device test pending · **Date:** Oct 24, 2026 · **Supports:** ADR 0006, US-IMP-03, NFR-31

## Question

Which Expo-compatible module reads text from a receipt screenshot on the phone, on both iOS and Android, without sending the image anywhere, and gives the parser what it needs?

## What the parser needs

A receipt row prints in columns: item number, description, price, tax flag. Text engines often return each column as a separate piece, in column order rather than row order. To rebuild rows, the parser needs each piece's **position on the image** (a bounding box). A module that returns only plain lines of text can't reliably put a price back next to its item.

## Candidates (checked Oct 24, 2026)

| Module | Engine | Boxes | Notes |
| --- | --- | --- | --- |
| `@infinitered/react-native-mlkit-text-recognition` 5.0.1 | Google ML Kit, on device | Yes: blocks, lines and elements, each with a frame | Expo module from Infinite Red's React Native ML Kit set; MIT; last published Nov 2025 |
| `expo-text-extractor` 2.0.0 | Apple Vision on iOS, ML Kit on Android | No: returns an array of strings | Expo SDK 52+; MIT; last published Feb 2026 |
| `expo-text-recognition` 0.1.1 | — | — | Last published Jul 2024; too stale |

## Decision

Use **`@infinitered/react-native-mlkit-text-recognition`** as the primary engine, because its element boxes let the app rebuild receipt rows. Keep `expo-text-extractor` as the fallback if the first doesn't build on Expo SDK 58. The parser accepts both shapes: pieces with boxes are grouped into rows by position, and plain strings are taken as rows in order (`app/src/parsing/rows.ts`).

Both run entirely on the phone, so screenshots and recognized text never leave it (NFR-05, NFR-13).

## What has been verified

- The receipt parser, row rebuilding and screenshot merging are built and tested in TypeScript against invented receipts, including a column-split recognition result, a misread price caught by the subtotal check, a receipt cut off before its totals, and two overlapping screenshots (`app/src/parsing/__tests__`).

## Still to verify on a phone

These need a development build of the app on a real device. Expo Go can't load native modules.

1. The chosen module builds and runs on Expo SDK 58 for both iOS and Android.
2. On real screenshots of the Costco app's receipt view: how often item numbers, prices and the trailing minus on discount lines are read correctly, and how often all three parse checks pass with no corrections (target in NFR-31: 95%).
3. How a long receipt splits across screenshots, and whether Android's scrolling screenshot (one tall image) works better than several separate ones.

Real screenshots are used only on the phone during this test; only counts and pass rates are recorded here.
