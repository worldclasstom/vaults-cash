import Link from "next/link";
import { LegalPage, OPERATOR, OPERATOR_URL, Section } from "@/components/LegalPage";
import { ContactEmail } from "@/components/ContactEmail";

export const metadata = { title: "Privacy Policy" };

const UPDATED = "September 28, 2026";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED} intro="What we collect, why, who sees it, and what we never do with it. It is a short list.">
      <Section title="1. Who this covers">
        <p>
          This policy describes how <strong>{OPERATOR}</strong> (
          <a href={OPERATOR_URL} className="underline underline-offset-2 hover:text-foreground">
            {OPERATOR_URL.replace("https://", "")}
          </a>
          ) handles information when you use vaults.cash: the website, the mobile apps, the API and MCP server, and
          any support conversation with us. It applies to the iPhone app in the same way it applies to the website.
        </p>
      </Section>

      <Section title="2. What we collect">
        <p>
          <strong>Login and account information.</strong> When you log in, our wallet provider, Privy, Inc., collects
          the email address, phone number, or Google or Apple account you choose to log in with, and gives us a
          stable user identifier and your wallet addresses. We store the identifier and the addresses. We do not store
          your password (there is none) and we never see your private key.
        </p>
        <p>
          <strong>What you do on the Service.</strong> We keep records that the Service needs to work: the targets you
          set and their rungs, the invite code you were referred by and the code you share, the fees paid on
          transactions you make, and any agent access keys you create (stored hashed, so we cannot read them back).
        </p>
        <p>
          <strong>Technical information.</strong> Our hosting provider, Vercel, records the IP address, browser or app
          version and pages requested for each visit in ordinary server logs, kept for a limited time for security and
          debugging. We set one first-party cookie of our own: a 90-day referral cookie so we know who invited you.
          Privy sets the cookies it needs to keep you logged in. The app also stores a copy of recent public market data
          and your own positions in your browser to make pages load faster; that copy never leaves your device and is
          cleared when you log out.
        </p>
        <p>
          <strong>What we do not do.</strong> We do not run advertising trackers, we do not sell or rent personal
          information, and today we run no third-party analytics. If we add a privacy-respecting analytics tool, we will
          update this page first.
        </p>
      </Section>

      <Section title="3. The blockchain is public">
        <p>
          Every transaction you sign is recorded permanently on a public blockchain: your wallet address, the amounts,
          the positions, the fees. Anyone can read it, we cannot change or delete it, and it is not covered by this
          policy. If you would rather not link your identity to an address, you can export your key and use the
          Service from a fresh wallet.
        </p>
      </Section>

      <Section title="4. Why we use it">
        <ul>
          <li>To provide the Service: show you your positions, build your transactions, run your targets and pay referrals.</li>
          <li>To keep the Service secure and detect abuse.</li>
          <li>To respond when you contact us.</li>
          <li>To meet legal obligations, including sanctions screening if we are required to perform it.</li>
        </ul>
        <p>
          If you are in the European Economic Area or the United Kingdom, our legal bases are performance of our contract
          with you, our legitimate interests in running and securing the Service, and compliance with law.
        </p>
      </Section>

      <Section title="5. Who we share it with">
        <p>We share information only with the providers that run the Service, each under its own privacy terms:</p>
        <ul>
          <li><strong>Privy, Inc.</strong> — login and embedded wallets.</li>
          <li><strong>Vercel, Inc.</strong> — hosting, server logs, and scheduled jobs.</li>
          <li><strong>Neon, Inc.</strong> — the database that stores the records in Section 2.</li>
          <li>
            <strong>Blockchain infrastructure providers</strong>, currently Alchemy and Coinbase Developer Platform —
            they relay your transactions and see the wallet addresses and transaction contents involved.
          </li>
          <li><strong>Apple and Google</strong> — if you use their login or install the app from their stores.</li>
        </ul>
        <p>
          We may also disclose information when the law requires it, to protect the rights and safety of users or the
          public, or to a successor if the business is sold or reorganized. We do not share it with anyone else.
        </p>
      </Section>

      <Section title="6. AI agents you connect">
        <p>
          If you create an agent access key and give it to an AI agent or platform, that platform will see whatever it
          asks the Service about your account, on your instruction. That is governed by the platform&apos;s privacy
          terms, not ours. You can revoke a key or turn agent access off at any time on the Account page.
        </p>
      </Section>

      <Section title="7. How long we keep it">
        <p>
          Account records are kept while your account exists and for as long afterwards as we need them to resolve
          disputes, pay referrals already earned, or meet legal requirements. Server logs are kept briefly. Agent keys
          are deleted when you revoke them.
        </p>
      </Section>

      <Section title="8. Your choices and rights">
        <p>
          You can see and export your wallet key on the Account page and stop using the Service at any time; your
          positions stay in your wallet regardless. To ask what we hold about you, to correct it, or to have your
          account records deleted, email <ContactEmail /> from the address on your account. We will answer within 30 days.
          We cannot delete anything already written to a blockchain.
        </p>
        <p>
          If you live in California, you have the right to know what personal information we collect and how it is
          used, to request deletion, and not to be discriminated against for exercising those rights. We do not sell or
          share personal information for cross-context advertising. If you live in the EEA or UK, you may also object to
          or restrict certain processing and complain to your data-protection authority.
        </p>
      </Section>

      <Section title="9. Security, children, and where data lives">
        <p>
          We use encryption in transit, keep secrets out of the browser, and limit access to production systems. No
          system is perfectly secure; keep your login and agent keys safe. The Service is for adults: we do not
          knowingly collect information from anyone under 18, and we will delete it if we learn we have. Our providers
          store data in the United States; by using the Service from elsewhere you agree to that transfer.
        </p>
      </Section>

      <Section title="10. Changes and contact">
        <p>
          We will post changes here and update the date at the top; material changes will be announced on the Service
          first. Questions and requests: {OPERATOR} · <ContactEmail />. See also our{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms of Service
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
