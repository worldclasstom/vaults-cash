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
  // Next.js needs inline scripts; Turnstile is Privy's captcha. Dev needs eval for HMR.
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
  "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
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
