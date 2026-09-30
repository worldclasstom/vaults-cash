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
`npx expo-doctor`. (`npx expo lint` is wired up but eslint-plugin-react does not
yet support the ESLint that ships with SDK 57; typecheck is the gate for now.)

Native build on this Mac (Expo's `run:ios` mistakes the simulator for a
device): `cd ios && xcodebuild -workspace vaultscash.xcworkspace -scheme
vaultscash -sdk iphonesimulator -destination "platform=iOS Simulator,id=<udid>"
-derivedDataPath build CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=NO build`,
then install the .app from `ios/build/Build/Products/Debug-iphonesimulator/`.

## Privy

The dashboard needs an app client for bundle id `cash.vaults.app`
(Configuration → App settings → Clients → Add app client → allowed app
identifiers). Its client id goes in `EXPO_PUBLIC_PRIVY_CLIENT_ID`. Apple
login on iOS uses the bundle id as the Apple client id on that app client.

## App Store

Apple's crypto rule (3.1.5) requires the developer account to be enrolled as
an organization. Enroll Prosperity Labs LLC (needs a D-U-N-S number) before
the first TestFlight build.

## Fonts
`assets/fonts/` holds a static Bricolage Grotesque ExtraBold (instanced from the web's
variable TTF with `fonttools varLib.instancer` at wght 800 / opsz 96) and the Geist and
Geist Mono statics copied from the `geist` package. `src/theme.ts` maps them to the
`fonts` tokens; the root layout holds the splash until they load.
