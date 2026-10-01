
## 2026-09-30 — Phone app is gated behind sign-in, with an intro
The iOS app now opens on a welcome door (three swipeable slides: the brand, how Pools work,
how Targets work) with the sign-in tray under it: Apple's official white button, a white
Google pill, and "Email or Phone" that turns the tray into the code flow. Nothing else is
reachable until Privy has a user (expo-router `Stack.Protected`). This matches how the
comparable apps (fomo, Liquid) open and stops an anonymous browse of pools from being the
first impression. Sign-in buttons are Bill White, not green: Apple's button must be
white/black by their rules, and the One Green Rule keeps green for the money in the slides.
The native splash is held until fonts and Privy are ready, so there is one loading state.
Fonts: a static Bricolage ExtraBold instance (generated with fonttools from the web's
variable TTF) plus Geist / Geist Mono statics live in mobile/assets/fonts and load with
expo-font; the display face is now the same on phone and web.

## 2026-10-01 — Phone funding: Privy's modal for Base USDC; Robinhood Chain needs its own door
The phone's Add funds opens a sheet with two doors. "Buy with Apple Pay or card" calls Privy's
`useFundWallet` (the `@privy-io/expo/ui` package, which also mounts `PrivyElements`), destination
USDC on Base; Privy routes to MoonPay or Coinbase and opens it in an in-app browser. "Transfer
from an exchange or wallet" shows the address, a QR and the two chain stickers. Send is next to
Add funds, as on the web, and runs through the same smart-wallet user-op path (`lib/sendCalls.ts`,
with the USDG paymaster context on Robinhood Chain).

Robinhood Chain is deliberately NOT a funding destination through Privy: `isSupportedChainIdForMoonpay(4663)`
is false and `chainToMoonpayCurrency(4663)` logs "not supported, defaulting to Ethereum mainnet" and
returns ETH_ETHEREUM, so a call with chain 4663 would buy ETH on L1. MoonPay itself does sell USDG on
Robinhood Chain (Aug 2026, not NY/Canada), so the routes for USDG are MoonPay's own widget (MoonPay
business account + signed URLs) or Robinhood Connect (free plug-in, funds from a Robinhood balance
with no fee; Tom applied 2026-10-01). Until one lands, USDG arrives by transfer or by bridging from Base.

Test note: the office network resets connections to moonpay.com, pay.coinbase.com and mainnet.base.org,
so the MoonPay page can't be exercised from the simulator there; the Privy hand-off itself was verified
(it opened buy.moonpay.com).
