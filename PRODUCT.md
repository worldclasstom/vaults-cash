# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the crypto-curious beginner. Has a Robinhood or Coinbase account and
some USDC, has never used a DeFi app, and wants their money to earn without
learning Uniswap. They arrive from a referral link or a search, on a phone as
often as a desktop, and judge the product in the first minute: can I see where
my money is, can I get it back, do I understand what I'm signing.

Secondary (not designed for first): existing DeFi users who already provide
liquidity and want a faster, cleaner way; AI agents and integrators using the
MCP/REST API with a referral code. Power-user depth lives behind "Advanced"
disclosures, never in the default path.

## Product Purpose

vaults.cash turns dollars (USDC on Base, USDG on Robinhood Chain) into an
earning Uniswap v4 liquidity position in one tap, and turns it back into
dollars in one tap. The position earns the fees traders pay in that pool.
Success over the next six months means deposit volume and fee revenue, active
positions that people keep open and add to, and referral-driven growth from
the on-chain 50/50 fee split.

## Positioning

Lead claim: **Robinhood-simple earning** — the simplicity is the product.
Supporting mechanism the homepage already carries: **you earn what traders
pay**, income from real activity, never a promised rate.
The proof underneath both: vaults.cash deploys no contracts and holds
nothing. Positions are official Uniswap v4 NFTs in the user's own wallet;
the app only builds the transaction the user reviews and signs. `/trust`,
the decoded signing steps, and "Open in Uniswap" links make that checkable.

## Operating Context

- Two chains, one wallet: a Privy smart wallet with the same address on Base
  (gas sponsored) and Robinhood Chain (user pays sub-cent gas). Which chain
  money is on is always shown.
- Funding through Privy's modal (card, bank, bridged crypto) or by sending
  to the wallet address; Robinhood users may move USDC/USDG from the app.
- Markets are every live pool as a pair (`<chain>/<base>-<quote>`), auto-
  listed with a liquidity floor, thin-TVL hiding, and an idle badge.
- Minimum deposit $5 (sponsored gas economics). Fee 0.6% on conversion,
  split on-chain with a referrer when there is one.
- Agents: MCP at `/api/mcp/mcp` and REST `/api/agent/*`, same engine.

## Capabilities and Constraints

- Deposit (new or add), withdraw, collect fees; presets Set & forget /
  Balanced / Aggressive plus custom width; range shown as dollars.
- Referral link → httpOnly cookie → bound on first authenticated call;
  invite card on Account.
- Stock tokens (Robinhood-issued, ERC-8056) are listed as a first-class
  category; the former jurisdiction gate was removed 2026-09-23. Legal
  review before public marketing is still open.
- Not a deposit account, not insured; positions carry market and
  impermanent-loss risk. Disclosures at `/disclosures`.
- Undecided: the account-linked agent access (session signers), "Targets"
  range orders and their auto-close contract, the leverage loop, iOS app.

## Brand Commitments

Name and wordmark: vaults.cash (green cash-stack mark, `public/brand/`).
Observed voice in the shipped product (not separately confirmed by the
user in the init interview): plain-spoken, compliance-careful — no APY
promises, risks named in plain words, "Not a deposit account, not insured."
Official third-party marks only (Base mark, Robinhood feather for stock
tokens), with the required non-affiliation disclosure.

## Evidence on Hand

- Live product at https://vaults.cash; first gasless deposit on Base
  2026-09-23; positions visible in Uniswap's own app.
- Public repo (MIT) with SECURITY.md; no audit (there is no contract).
- No testimonials, press, TVL figures, or partner logos exist. Future work
  must not fabricate any of these.

## Product Principles

1. One tap in, one tap out; everything else is optional depth.
2. Show, don't promise: real fees earned, real ranges, real minimums.
3. Your money is never ours: no custody, no contracts, verifiable in-product.
4. Name the chain, name the risk, name the fee — every time it matters.
5. Growth is built in: referrals and integrators earn the same split we do.

## Accessibility & Inclusion

Phone-first layouts with a bottom tab bar; keyboard-operable custom controls
(sheets trap focus, selects are listboxes); visible accent focus rings;
reduced-motion respected. No formal standard has been mandated.
