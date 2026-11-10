# App

React Native + Expo (SDK 58) Android app. See [docs/design/architecture.md](../docs/design/architecture.md).

## Run it on your phone

1. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_URL` to the Cloud Run URL:
   `gcloud run services describe price-match-api --region us-central1 --format='value(status.url)'`
2. `npm install`, then `npx expo start`.
3. On the Android phone, install **Expo Go** from the Play Store and scan the QR code.
   The phone and PC must be on the same Wi-Fi (or run `npx expo start --tunnel`).

Later, once native text recognition is added, the app needs a development build
(`npx expo run:android` with Android Studio) instead of Expo Go.

## Screens

| Tab | What it does |
| --- | --- |
| Price drops | Open drops with the refund due; tap one for the claim card to show the help desk |
| Purchases | Purchases inside their 30-day window, fewest days left first; add one by hand; long-press to delete |
| Settings | Savings so far, account, sign out |

The refresh token is kept in the Android Keystore (expo-secure-store); the access token
stays in memory. `EXPO_PUBLIC_*` values are built into the app, so never put secrets there.

## Checks

```bash
npm run typecheck && npm run lint && npm test
```
