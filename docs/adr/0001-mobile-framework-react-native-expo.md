# ADR 0001: React Native with Expo for the iOS and Android app

**Status:** Accepted · **Date:** Oct 21, 2026

## Context

The charter calls for one cross-platform codebase for iOS and Android (NFR-30). The app needs an in-app browser for the Costco sign-in and receipt sync (FR-01, FR-03), secure storage backed by the iOS Keychain and Android Keystore (NFR-02, NFR-08), push notifications (FR-19, FR-29), a share-sheet target for receipt PDFs (FR-06), and an offline cache (FR-23). The developer works on Windows and knows JavaScript; Dart would be new.

## Decision

Build the app with React Native and Expo, in TypeScript.

- In-app browser: `react-native-webview`
- Secure storage: `expo-secure-store` (Keychain / Keystore)
- Push: `expo-notifications` with the Expo push service in front of APNs and FCM (see OQ-10)
- Builds: EAS Build, so iOS builds don't need a Mac
- Updates: EAS Update for over-the-air JavaScript fixes between store builds

## Consequences

- Close to the developer's existing JavaScript skills, so the MVP moves faster.
- Native features not covered by Expo modules (the share-sheet target in particular) need a config plugin or a small native module, built with a development build rather than Expo Go.
- EAS free-tier build quotas apply; Phase 1 build volume is expected to fit (NFR-28).

## Alternatives considered

- **Flutter:** consistent rendering and a strong toolchain, but a new language, community-maintained webview and secure-storage plugins, and iOS builds that need a Mac or a paid CI service.
- **Two native apps (Swift and Kotlin):** best platform fit, but double the work for a part-time solo build.
