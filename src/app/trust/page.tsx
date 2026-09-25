import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import { ChainChip, Chip } from "@/components/TokenIcon";
import { CHAINS, CHAIN_IDS, explorerUrl } from "@/lib/chain";

export const metadata = { title: "What vaults.cash can and can't do — vaults.cash" };

const FEE_WALLET = process.env.NEXT_PUBLIC_FEE_RECIPIENT;
const SOURCE_URL = process.env.NEXT_PUBLIC_SOURCE_URL;
const FEE_PCT = Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 100;

function Section({ title, sticker, children }: { title: string; sticker?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="tilt rounded-3xl bg-surface p-6 shadow-card sm:p-7">
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
        {sticker}
      </div>
      {children}
    </section>
  );
}

function Item({ tone, children }: { tone: "accent" | "negative" | "muted"; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed text-muted">
      <span className="pt-0.5">
        <Chip tone={tone}>{tone === "negative" ? "No" : tone === "accent" ? "Yes" : "·"}</Chip>
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function TrustPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl animate-rise space-y-6 px-4 py-14 sm:px-6">
        <header className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Chip tone="accent">No custody</Chip>
            <Chip>No contracts of our own</Chip>
            <ChainChip chainId={8453} />
            <ChainChip chainId={4663} long />
          </div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">What vaults.cash can and can&apos;t do</h1>
          <p className="max-w-xl text-lg text-muted">
            vaults.cash has no smart contracts of its own and never holds your money. It builds a transaction, shows it to
            you, and you sign it from your own wallet. Here is exactly where that leaves us.
          </p>
        </header>

        <Section title="We can't" sticker={<Chip tone="negative">Not possible</Chip>}>
          <ul className="space-y-3">
            <Item tone="negative">Move, withdraw, or freeze your funds. Your wallet signs every transaction; we never have a key to it.</Item>
            <Item tone="negative">Change your positions. They are Uniswap v4 position NFTs owned by your wallet, not by vaults.cash.</Item>
            <Item tone="negative">Upgrade or pause anything. We deployed no contracts, so there is nothing for us to upgrade, pause, or drain.</Item>
            <Item tone="negative">See your keys. Your wallet is created and secured by Privy; vaults.cash only sees its public address.</Item>
            <Item tone="negative">Take a fee you didn&apos;t see. The {FEE_PCT}% fee is one line inside the transaction you review before signing.</Item>
          </ul>
        </Section>

        <Section title="We can" sticker={<Chip tone="accent">What we do</Chip>}>
          <ul className="space-y-3">
            <Item tone="accent">Build the transaction for you: convert your dollars, set the price range, and place the position in the official Uniswap pool, all in one step.</Item>
            <Item tone="accent">Charge the {FEE_PCT}% fee inside that step, paid to a published wallet, and split it with whoever invited you.</Item>
            <Item tone="accent">Pay your network fees on Base.</Item>
            <Item tone="accent">Move your dollars between Base and Robinhood Chain through Relay when you ask, to this same wallet.</Item>
            <Item tone="accent">Act on your wallet for an AI agent, only if you turn on agent access and only through vaults.cash; you can turn it off any time.</Item>
            <Item tone="muted">Change this website, add or remove pools, or stop operating. None of that touches positions you already hold.</Item>
          </ul>
        </Section>

        <Section title="If vaults.cash disappeared tomorrow" sticker={<Chip>Nothing happens to your money</Chip>}>
          <p className="text-sm leading-relaxed text-muted">
            Every position is a standard Uniswap v4 position that Uniswap&apos;s own app can manage. Each position on your
            Portfolio page has an &ldquo;Open in Uniswap&rdquo; link; that page works without us. Your wallet lives with
            Privy, not with vaults.cash, and you can export its key from the Account page at any time.
          </p>
        </Section>

        <Section title="Check it yourself" sticker={<Chip>Public ledger</Chip>}>
          <ul className="space-y-3">
            <Item tone="muted">
              Before signing, expand &ldquo;What you&apos;re signing&rdquo; on the confirm screen. Every step is listed in
              words, with the contract it goes to and the raw data.
            </Item>
            <Item tone="muted">On Portfolio, open any position in Uniswap or on the block explorer. The owner shown there is your wallet.</Item>
            {FEE_WALLET && (
              <Item tone="muted">
                The fee wallet is <span className="font-mono text-foreground">{FEE_WALLET}</span>:{" "}
                {CHAIN_IDS.map((id, i) => (
                  <span key={id}>
                    {i > 0 && " · "}
                    <a href={explorerUrl(id, "address", FEE_WALLET)} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                      on {CHAINS[id].label}
                    </a>
                  </span>
                ))}
                . Every fee ever charged is visible there.
              </Item>
            )}
            {SOURCE_URL && (
              <Item tone="muted">
                The code that builds every transaction is open source:{" "}
                <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                  {SOURCE_URL.replace(/^https?:\/\//, "")}
                </a>
                .
              </Item>
            )}
          </ul>
        </Section>

        <Section title="What can still go wrong" sticker={<Chip tone="negative">Markets, not custody</Chip>}>
          <p className="text-sm leading-relaxed text-muted">
            Liquidity positions carry price and impermanent-loss risk, Uniswap&apos;s own contracts carry smart-contract
            risk, and stock tokens depend on their issuer. Read the{" "}
            <Link href="/disclosures" className="text-accent underline-offset-2 hover:underline">
              disclosures
            </Link>
            .
          </p>
        </Section>
      </div>
    </MarketingShell>
  );
}
