import { MarketingShell } from "@/components/MarketingShell";
import { ChainChip, Chip } from "@/components/TokenIcon";
import { MIN_DEPOSIT_USD } from "@/lib/limits";
import { CHAINS } from "@/lib/chain";

export const metadata = { title: "Disclosures" };

const FEE_PCT = Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 100;

function Section({ title, sticker, children }: { title: string; sticker?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface p-6 shadow-card sm:p-7">
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
        {sticker}
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function DisclosuresPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl animate-rise space-y-6 px-4 py-14 sm:px-6">
        <header className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Chip>Plain words</Chip>
            <ChainChip chainId={8453} />
            <ChainChip chainId={4663} long />
          </div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">Disclosures</h1>
          <p className="max-w-xl text-lg text-muted">
            Everything we charge, everything that can go wrong, and what we are not. Short on purpose.
          </p>
        </header>

        <Section title="What vaults.cash is" sticker={<Chip tone="accent">Self-custodial</Chip>}>
          <p>
            vaults.cash is a self-custodial interface for providing liquidity to Uniswap v4 pools on Base and Robinhood
            Chain. Your funds sit in your own wallet and in pool positions you own. vaults.cash deploys no smart contracts
            and never takes custody. It is not affiliated with, endorsed by, or sponsored by Coinbase, Robinhood, Uniswap
            Labs, Circle, Paxos, Privy or Relay.
          </p>
          <p>
            Markets labelled &ldquo;Stock token&rdquo; are Robinhood-issued tokens on Robinhood Chain that track a US
            equity or ETF. They are not the underlying shares, carry no shareholder rights, and their availability depends
            on your jurisdiction. vaults.cash does not issue them.
          </p>
        </Section>

        <Section title="Fees" sticker={<Chip>{FEE_PCT}% flat</Chip>}>
          <p>
            vaults.cash charges {FEE_PCT}% of the amount converted when you enter a position, and {FEE_PCT}% of the amount
            converted back when you exit. It is a plain transfer inside the transaction you review before signing. Pool
            trading fees you earn are yours entirely. The minimum deposit is ${MIN_DEPOSIT_USD}.
          </p>
          <p>
            If you were invited, half of our fee on your deposits is paid to the person who invited you, on-chain, in the
            same transaction. It does not change what you pay.
          </p>
          <p>
            Gas (network fees) is separate from our fee and goes to the network, never to us.{" "}
            {CHAINS[8453].gasSponsored && CHAINS[4663].gasSponsored
              ? "On both Base and Robinhood Chain, vaults.cash pays it for you."
              : CHAINS[8453].gasSponsored
                ? "On Base, vaults.cash pays it for you. On Robinhood Chain you pay it from the ETH in your wallet, typically a few cents per action."
                : "You pay it from the ETH in your wallet, typically a few cents per action."}{" "}
            vaults.cash never marks it up.
          </p>
          <p>
            Moving dollars between chains uses Relay, a third-party bridge. Relay&apos;s route fee and the conversion
            rate are shown before you confirm; vaults.cash charges nothing for it.
          </p>
        </Section>

        <Section title="Risks" sticker={<Chip tone="negative">Read this one</Chip>}>
          <p>
            Liquidity positions are not deposits and are not insured. The value of a position changes with the price of
            the assets in it, and concentrated positions can underperform simply holding the assets (&ldquo;impermanent
            loss&rdquo;). Positions can go out of range and stop earning. Uniswap&apos;s contracts are widely audited but
            no smart contract is risk-free. Never deposit more than you can afford to lose.
          </p>
        </Section>

        <Section title="Steady pairs" sticker={<Chip tone="accent">Steady</Chip>}>
          <p>
            Markets marked &ldquo;Steady&rdquo; pair two assets that track the same thing, such as staked ETH against ETH,
            or one dollar token against another. Because both sides move together, impermanent loss is typically minimal.
            It is not zero: a stablecoin can de-peg and a staked token can trade away from its underlying, and either is
            realized as a loss in the position. Stablecoins are not bank deposits and are not FDIC-insured.
          </p>
        </Section>

        <Section title="Agent access" sticker={<Chip>Optional</Chip>}>
          <p>
            If you turn on agent access from your Account page, you authorize vaults.cash&apos;s server to sign
            transactions from your wallet through Privy, limited to depositing, adding, withdrawing and collecting through
            vaults.cash. Anyone holding an account key you create can trigger those actions. You can revoke keys and turn
            access off at any time; until you do, treat a key like a password.
          </p>
        </Section>

        <Section title="No advice">
          <p>
            Nothing here is investment, legal, or tax advice. Estimated APRs are extrapolations of the last 24 hours of
            real pool activity and are not promises of future returns. Availability may be restricted in some regions.
          </p>
        </Section>
      </div>
    </MarketingShell>
  );
}
