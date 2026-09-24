import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Security headers (Privy production checklist: CSP + X-Frame-Options).
 * Baseline from docs.privy.io/security/implementation-guide/content-security-policy,
 * plus every origin our client actually talks to. If you add an external
 * service the browser calls directly, add its origin here or it will be
 * silently blocked.
 */
const csp = [
  "default-src 'self'",
  // Next.js needs inline scripts; Turnstile is Privy's captcha; Privy's SDK
  // also loads helper scripts (e.g. telegram-login.js) from auth.privy.io
  // even for login methods we don't use. Dev needs eval for HMR.
  // Stripe's embedded crypto onramp (Privy's card / Apple Pay / bank method)
  // must load crypto-onramp-outer.js from crypto-js.stripe.com — it can't be
  // self-hosted — plus Stripe.js.
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}https://challenges.cloudflare.com https://auth.privy.io https://js.stripe.com https://*.js.stripe.com https://crypto-js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Funding modal frames: Stripe onramp UI (crypto.link.com), Stripe.js
  // frames (3DS via hooks.stripe.com), MoonPay, Coinbase Onramp.
  // oauth.telegram.org: Privy's SDK frames the Telegram widget even when
  // Telegram login is off.
  "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://oauth.telegram.org https://crypto.link.com https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://buy.moonpay.com https://pay.coinbase.com",
  "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://oauth.telegram.org https://crypto.link.com https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://buy.moonpay.com https://pay.coinbase.com",
  [
    "connect-src 'self'",
    // Privy
    "https://auth.privy.io https://*.rpc.privy.systems https://explorer-api.walletconnect.com",
    "wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org",
    // chain RPC + bundler/paymaster: Coinbase CDP (Base), Alchemy (Robinhood Chain), public fallbacks
    "https://api.developer.coinbase.com https://*.g.alchemy.com https://public.pimlico.io",
    "https://mainnet.base.org https://rpc.mainnet.chain.robinhood.com",
    // explorers used for position enumeration
    "https://base.blockscout.com https://robinhoodchain.blockscout.com",
    // funding: Stripe onramp + Stripe.js, MoonPay, Coinbase Onramp, Relay (crypto deposits/bridging)
    "https://api.stripe.com https://crypto.link.com https://api.moonpay.com https://pay.coinbase.com https://api.relay.link",
  ].join(" "),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
