# vaults.cash for iPhone

Expo (React Native) app that shares the web app's transaction builders
(`../src/lib`) and Privy login, so a user's smart wallet is the same address
on the phone and on vaults.cash.

## Layout

- `entrypoint.js` — polyfills, env bridge (`EXPO_PUBLIC_*` → the lib's
  `NEXT_PUBLIC_*` reads, RPC overrides), then expo-router.
- `metro.config.js` — watches `../src/lib`, pins viem / Uniswap SDKs to this
  package's node_modules, works around three packages' exports maps.
- `src/app/(tabs)/` — Pools, Targets, Portfolio, Account.
- `src/lib/config.ts`, `src/lib/data.ts`, `src/lib/wallet.ts`, `src/theme.ts`.
- Imports from the web lib use `@web/lib/...`.

## Run

Needs Xcode (full app, not just the command-line tools) and CocoaPods; the
Privy SDK has native modules, so Expo Go does not work.

    cp .env.example .env            # fill in EXPO_PUBLIC_PRIVY_CLIENT_ID
    npm install
    npx expo run:ios                # builds the dev client into the simulator
    npx expo start --dev-client     # afterwards, JS only

Checks that need no Xcode: `npm run typecheck`, `npx expo export --platform ios`,
`npx expo-doctor`.

## Privy

The dashboard needs an app client for bundle id `cash.vaults.app`
(Configuration → App settings → Clients → Add app client → allowed app
identifiers). Its client id goes in `EXPO_PUBLIC_PRIVY_CLIENT_ID`. Apple
login on iOS uses the bundle id as the Apple client id on that app client.

## App Store

Apple's crypto rule (3.1.5) requires the developer account to be enrolled as
an organization. Enroll Prosperity Labs LLC (needs a D-U-N-S number) before
the first TestFlight build.
