import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import { CHAINS, CHAIN_IDS, explorerUrl } from "@/lib/chain";

export const metadata = { title: "What vaults.cash can and can't do — vaults.cash" };

const FEE_WALLET = process.env.NEXT_PUBLIC_FEE_RECIPIENT;
const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL;
const FEE_PCT = Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 100;

function Item({ children }: { children: React.ReactNode }) {
  return <li className="pl-1">{children}</li>;
}

export default function TrustPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl animate-rise px-6 py-14">
        <h1 className="pb-2 text-3xl font-bold">What vaults.cash can and can&apos;t do</h1>
        <p className="pb-8 text-muted">
          vaults.cash has no smart contracts of its own and never holds your money. It builds a transaction, shows
          it to you, and you sign it from your own wallet. Here is exactly where that leaves us.
        </p>
        <div className="space-y-8 text-sm leading-relaxed text-muted">
          <section>
            <h2 className="pb-2 text-lg font-semibold text-foreground">We can&apos;t</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <Item>Move, withdraw, or freeze your funds. Your wallet signs every transaction; we never have a key to it.</Item>
              <Item>Change your positions. They are Uniswap v4 position NFTs owned by your wallet, not by vaults.cash.</Item>
              <Item>Upgrade or pause anything. We deployed no contracts, so there is nothing for us to upgrade, pause, or drain.</Item>
              <Item>See or export your keys. Your wallet is created and secured by Privy; vaults.cash only sees its public address.</Item>
              <Item>Take a fee you didn&apos;t see. The {FEE_PCT}% fee is one line inside the transaction you review before signing.</Item>
            </ul>
          </section>
          <section>
            <h2 className="pb-2 text-lg font-semibold text-foreground">We can</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <Item>Build the transaction for you: convert your dollars, set the price range, and place the position in the official Uniswap pool, all in one step.</Item>
              <Item>Charge the {FEE_PCT}% fee inside that step, paid to a published wallet.</Item>
              <Item>Pay your network fees on Base.</Item>
              <Item>Change this website, add or remove pools, or stop operating. None of that touches positions you already hold.</Item>
            </ul>
          </section>
          <section>
            <h2 className="pb-2 text-lg font-semibold text-foreground">If vaults.cash disappeared tomorrow</h2>
            <p>
              Nothing happens to your money. Every position is a standard Uniswap v4 position that Uniswap&apos;s own app can
              manage. Each position on your Portfolio page has an &ldquo;Open in Uniswap&rdquo; link; that page works without
              us. Your wallet lives with Privy, not with vaults.cash, and you can export its key from the Account page
              at any time.
            </p>
          </section>
          <section>
            <h2 className="pb-2 text-lg font-semibold text-foreground">Check it yourself</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <Item>
                Before signing, expand &ldquo;What you&apos;re signing&rdquo; on the confirm screen. Every step is listed in
                words, with the contract it goes to and the raw data.
              </Item>
              <Item>
                On Portfolio, open any position in Uniswap or on the block explorer. The owner shown there is your wallet.
              </Item>
              {FEE_WALLET && (
                <Item>
                  The fee wallet is{" "}
                  <span className="font-mono text-foreground">{FEE_WALLET}</span>:{" "}
                  {CHAIN_IDS.map((id, i) => (
                    <span key={id}>
                      {i > 0 && " · "}
                      <a href={explorerUrl(id, "address", FEE_WALLET)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                        on {CHAINS[id].label}
                      </a>
                    </span>
                  ))}
                  . Every fee ever charged is visible there.
                </Item>
              )}
              {SOURCE_URL && (
                <Item>
                  The code that builds every transaction is open source:{" "}
                  <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {SOURCE_URL.replace(/^https?:\/\//, "")}
                  </a>
                  .
                </Item>
              )}
            </ul>
          </section>
          <section>
            <h2 className="pb-2 text-lg font-semibold text-foreground">What can still go wrong</h2>
            <p>
              Not custody, but markets. Liquidity positions carry price and impermanent-loss risk, Uniswap&apos;s own
              contracts carry smart-contract risk, and stock tokens depend on their issuer. Read the{" "}
              <Link href="/disclosures" className="underline underline-offset-2">
                disclosures
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </MarketingShell>
  );
}
