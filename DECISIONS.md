
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

## 2026-10-01 — Robinhood Chain has one real crypto pool, and that is the honest answer
The phone showed ETH/USDG alone under "crypto" on Robinhood Chain, so we went looking for what
discovery had missed. The candidate list was the official contracts page (USDG, WETH, 25 stock
tokens), so the probes never asked about anything else. Discovery now pulls every stock token on
chain from Robinhood's Stock Token API (194 at the time) and probes them all; the liquidity floor
decides what lists (75 tickers made it, up from 25). Unknown tokens that expose an ERC-8056
uiMultiplier are classified "stock", so new tickers land in the stock tab. Robinhood markets
went 65 → 147.

Crypto did NOT grow, on purpose. Everything GeckoTerminal shows on this chain with big "TVL" is
counterfeit: "BTC"/"USDB" (9- and 8-decimal tokens with invented supply), three different "USDC"s,
a "LINK", an "XRP Robinhood", and a "cbBTC"/"cbXRP" pair that copy Coinbase's names, decimals and
supply but sit at random addresses (Coinbase deploys its wrappers at one vanity address on every
chain) and price 15–25% off spot, which arbitrage would never allow for the real thing. Only WETH
is a canonical bridged token (it answers l1Address()). The scanner now fails any candidate whose
symbol is a known Coinbase wrapper at the wrong address. Robinhood Chain has no bridged USDC,
USDT or BTC today; USDG is the only real dollar and ETH the only real crypto asset. More crypto
pools there wait on Robinhood or a canonical bridge bringing real assets over.

Known gaps: the deepest ETH/USDG v4 pool ($28M) is a hooked dynamic-fee pool, out of scope until
contract v2's hook allowlist. The phone also silently lost every v3 pool on both chains until
today: Metro's dev-only lazy bundling resolved the shared lib's `import("./v3core")` against the
phone project root (mobile/metro.config.js now redirects it).
