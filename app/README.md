# App

React Native + Expo (SDK 58) Android app. See [docs/design/architecture.md](../docs/design/architecture.md).

## Run it on your phone

### Quick look with Expo Go (no screenshot import)

1. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_URL` to the Cloud Run URL:
   `gcloud run services describe price-match-api --region us-central1 --format='value(status.url)'`
2. `npm install`, then `npx expo start`.
3. On the Android phone, install **Expo Go** from the Play Store and scan the QR code.
   The phone and PC must be on the same Wi-Fi (or run `npx expo start --tunnel`).

### Development build (everything, including screenshot import)

Screenshot import uses on-device text recognition (`modules/receipt-text`, Google ML Kit),
which Expo Go can't load. Build the app once with Android Studio's tools:

1. Install [Android Studio](https://developer.android.com/studio). In **More Actions → SDK Manager**,
   make sure an Android SDK Platform and **Android SDK Build-Tools** are installed.
2. Set `ANDROID_HOME` to the SDK folder (shown at the top of SDK Manager, usually
   `%LOCALAPPDATA%\Android\Sdk`) and add `%ANDROID_HOME%\platform-tools` to `PATH`.
3. On the phone: **Settings → About phone →** tap **Build number** 7 times, then
   **Developer options → USB debugging** on. Plug the phone in and allow the PC.
   `adb devices` should list it.
4. From `app/`: `npm install`, then `npx expo run:android`. The first build takes 5–15 minutes;
   it installs the app on the phone and starts the dev server.
5. Afterwards, `npx expo start --dev-client` is enough until native code changes.

## Import a receipt

In the Costco app open **Account → Orders & Purchases → Warehouse**, open a receipt, and take
screenshots from top to bottom with a little overlap, including the totals and the
`Whse/Trm/Trn` line at the bottom. In this app: **Purchases → Import receipt screenshots** and
pick them in order. Text is read on the phone; only the parsed purchase lines are sent to the
server. The review screen checks the item count, subtotal and instant savings, and lets you
correct a misread price or remove a line before saving.

## Screens

| Tab | What it does |
| --- | --- |
| Price drops | Open drops with the refund due; tap one for the claim card to show the help desk |
| Purchases | Purchases inside their 30-day window, fewest days left first; import receipt screenshots or add by hand; long-press to delete |
| Settings | Savings so far, account, sign out |

The refresh token is kept in the Android Keystore (expo-secure-store); the access token
stays in memory. `EXPO_PUBLIC_*` values are built into the app, so never put secrets there.

## Checks

```bash
npm run typecheck && npm run lint && npm test
```
