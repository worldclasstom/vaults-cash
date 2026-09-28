import Link from "next/link";
import { LegalPage, OPERATOR, OPERATOR_URL, Section } from "@/components/LegalPage";
import { ContactEmail } from "@/components/ContactEmail";

export const metadata = { title: "Terms of Service" };

const UPDATED = "September 28, 2026";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={UPDATED} intro="The agreement between you and the company behind vaults.cash. Written to be read.">
      <Section title="1. Who we are, and what you are agreeing to">
        <p>
          vaults.cash (the &ldquo;Service&rdquo;: the website at vaults.cash, the vaults.cash mobile apps, the vaults.cash API and
          MCP server, and the smart contracts we publish) is operated by <strong>{OPERATOR}</strong>, an Oklahoma limited
          liability company (&ldquo;we&rdquo;, &ldquo;us&rdquo;). Our company site is{" "}
          <a href={OPERATOR_URL} className="underline underline-offset-2 hover:text-foreground">
            {OPERATOR_URL.replace("https://", "")}
          </a>
          .
        </p>
        <p>
          By creating an account, connecting a wallet, or using any part of the Service, you agree to these Terms, to our{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
          , and to the{" "}
          <Link href="/disclosures" className="underline underline-offset-2 hover:text-foreground">
            Disclosures
          </Link>
          , which are part of these Terms. If you do not agree, do not use the Service.
        </p>
      </Section>

      <Section title="2. What the Service is, and is not">
        <p>
          The Service is <strong>self-custodial software</strong>. It helps you build transactions that you sign from your
          own wallet and that interact with third-party, open-source protocols on public blockchains, chiefly Uniswap v4 on
          Base and Robinhood Chain. Every position the Service helps you open is an NFT held in your wallet. We never
          hold, control or have access to your funds or your keys.
        </p>
        <p>
          We are <strong>not</strong> a bank, broker-dealer, exchange, investment adviser, money transmitter, custodian or
          fiduciary, and we do not act as your agent except in the narrow, opt-in ways described in Section 7. Nothing
          on the Service is investment, legal, tax or financial advice. Estimated yields are extrapolations of recent
          pool activity, not promises.
        </p>
        <p>
          The blockchains, pools, tokens and wallets you use through the Service belong to third parties and are governed
          by their own terms. We do not control them and are not responsible for them.
        </p>
      </Section>

      <Section title="3. Who may use the Service">
        <p>You may use the Service only if all of the following are true:</p>
        <ul>
          <li>You are at least 18 years old and able to enter a binding contract.</li>
          <li>
            You are not located in, organized in or a resident of a country or territory subject to comprehensive U.S.
            sanctions, and you are not on any U.S. or other applicable sanctions or restricted-party list.
          </li>
          <li>Your use of the Service, and of each market you access, is lawful where you are.</li>
          <li>You are using the Service for yourself, not on behalf of someone else, unless you are legally authorized to.</li>
        </ul>
        <p>
          Some markets, in particular <strong>tokenized stock markets on Robinhood Chain</strong>, involve tokens issued
          by third parties who restrict who may hold them. Those issuers, not we, decide eligibility, and their
          restrictions may exclude persons in some jurisdictions, including the United States. It is your responsibility
          to confirm that you are permitted to hold any token you acquire through the Service. We may restrict or block
          access to any market, feature or region at any time, with or without notice.
        </p>
      </Section>

      <Section title="4. Your wallet and your keys">
        <p>
          Your vaults.cash wallet is an embedded wallet provided by Privy, Inc. and a smart account deployed on chain
          under your control. Its key is split between your device and Privy&apos;s infrastructure; we never have it. You
          can export the private key at any time from the Account page and use it in any other wallet.
        </p>
        <p>
          <strong>You are responsible for your wallet.</strong> If you lose access to the login you used (email, phone,
          Google or Apple account, passkey), we cannot recover your wallet or your funds. Keep your login secure and keep
          an exported backup if you hold meaningful value.
        </p>
      </Section>

      <Section title="5. Fees">
        <p>
          We charge the fees described on the{" "}
          <Link href="/disclosures" className="underline underline-offset-2 hover:text-foreground">
            Disclosures
          </Link>{" "}
          page: today a flat conversion fee of 0.6% of the amount converted on the way into and out of a position, and,
          for Targets only, a performance fee of 8% of the trading fees a ladder earns for you. Fees are collected on
          chain in the same transaction they relate to. Network (gas) costs are separate and go to the network, not to
          us. We may change fees prospectively by updating the Disclosures page; changes never apply to transactions
          you already signed.
        </p>
        <p>
          When you invite someone, half of our fee on their transactions is paid to your wallet on chain. We may change
          or end the referral program at any time for future transactions, and may withhold referral payments we
          reasonably believe result from abuse, such as referring yourself.
        </p>
      </Section>

      <Section title="6. Risks you accept">
        <p>Using the Service means accepting risks that can cost you some or all of what you put in, including:</p>
        <ul>
          <li>
            <strong>Market and impermanent-loss risk.</strong> A liquidity position changes composition as prices move
            and can be worth less than simply holding the assets.
          </li>
          <li>
            <strong>Smart-contract risk.</strong> Uniswap, the wallet contracts, our LadderCloser contract and the
            blockchains themselves can contain bugs or be exploited. Our contracts are reviewed, not guaranteed.
          </li>
          <li>
            <strong>Token and stablecoin risk.</strong> USDC, USDG and every other token can lose value, be frozen by
            their issuer, or fail. Tokenized stocks are not shares and confer no shareholder rights.
          </li>
          <li>
            <strong>Network risk.</strong> Chains can halt, reorganize, congest, or change their rules.
          </li>
          <li>
            <strong>No insurance.</strong> Nothing here is FDIC-, SIPC- or otherwise insured.
          </li>
        </ul>
        <p>Do not use money you cannot afford to lose.</p>
      </Section>

      <Section title="7. Targets, auto-close and agent access">
        <p>
          <strong>Targets.</strong> A target is a ladder of positions you mint from your own wallet. If you leave
          auto-close on, the ladder is registered with our published LadderCloser smart contract, which anyone may call
          but which can only close the ladder once every rung has been crossed, and can only pay the proceeds to your
          wallet, less the disclosed fees. We run a service that calls it when a target prints, on a best-efforts basis.
          We do not guarantee that a close happens at any particular time or price. You can cancel a ladder, or close it
          yourself, at any time.
        </p>
        <p>
          <strong>Agent access.</strong> If you turn on agent access, you authorize a signer operated by us to submit
          transactions from your wallet, limited to the actions offered through the Service, on your instruction or on
          the instruction of an AI agent to which you have given an account key. You may turn it off at any time. An
          account key is like a password: anyone who holds it can act as you within those limits. You are responsible
          for keys you create and for any third-party agent or platform you connect them to.
        </p>
      </Section>

      <Section title="8. Things you must not do">
        <ul>
          <li>Break the law, evade sanctions, launder money, or help anyone else do so.</li>
          <li>Manipulate markets, including wash trading or trading against your own ladder to farm fees or referrals.</li>
          <li>Attack, probe, overload or reverse-engineer the Service beyond what the open-source license allows.</li>
          <li>Use the Service to infringe anyone&apos;s rights or to harass anyone.</li>
          <li>Misrepresent who you are or where you are, including with tools designed to defeat regional restrictions.</li>
        </ul>
      </Section>

      <Section title="9. Intellectual property">
        <p>
          The vaults.cash name, logo and design belong to us. Where we publish source code, it is licensed under the
          license in that repository. You may not use our name or marks to suggest we endorse you without our written
          permission. If you send us ideas or feedback, we may use them without obligation to you.
        </p>
      </Section>

      <Section title="10. No warranty">
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
          IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. WE DO NOT
          WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE OR SECURE, THAT ANY TRANSACTION WILL BE INCLUDED IN
          A BLOCKCHAIN, OR THAT ANY ESTIMATE WILL PROVE ACCURATE.
        </p>
      </Section>

      <Section title="11. Limitation of liability">
        <p>
          TO THE FULLEST EXTENT PERMITTED BY LAW, WE AND OUR MEMBERS, OFFICERS, CONTRACTORS AND SUPPLIERS WILL NOT BE
          LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS,
          DATA, TOKENS OR VALUE, ARISING FROM OR RELATED TO THE SERVICE, HOWEVER CAUSED. OUR TOTAL LIABILITY FOR ALL
          CLAIMS RELATED TO THE SERVICE WILL NOT EXCEED THE GREATER OF THE FEES YOU PAID US IN THE TWELVE MONTHS BEFORE
          THE CLAIM AROSE OR ONE HUNDRED U.S. DOLLARS. SOME JURISDICTIONS DO NOT ALLOW SOME OF THESE LIMITS, SO SOME MAY
          NOT APPLY TO YOU.
        </p>
      </Section>

      <Section title="12. Indemnity">
        <p>
          You will defend and indemnify us against claims, losses and expenses (including reasonable legal fees) arising
          from your use of the Service, your breach of these Terms, your violation of any law or third-party right, or
          any transaction you sign.
        </p>
      </Section>

      <Section title="13. Disputes: Oklahoma law, arbitration, no class actions">
        <p>
          These Terms are governed by the laws of the State of Oklahoma, without regard to its conflict-of-laws rules.
        </p>
        <p>
          <strong>Please read this carefully.</strong> Any dispute between you and us arising from these Terms or the
          Service will be resolved by <strong>binding individual arbitration</strong> administered by the American
          Arbitration Association under its Consumer Arbitration Rules, rather than in court, except that either party
          may bring an individual claim in small-claims court, and either party may seek an injunction to protect
          intellectual property. The arbitration will be conducted in Tulsa County, Oklahoma, or by video, and the
          arbitrator&apos;s decision may be entered in any court. <strong>You and we each waive the right to a jury trial
          and to participate in a class action or class-wide arbitration.</strong>
        </p>
        <p>
          You may opt out of this arbitration agreement by emailing <ContactEmail /> within 30 days of first accepting
          these Terms, with your wallet address and a statement that you opt out. If you do, disputes will be heard in
          the state or federal courts located in Tulsa County, Oklahoma, and you consent to their jurisdiction.
        </p>
      </Section>

      <Section title="14. Changes, termination, and the rest">
        <p>
          We may update these Terms. The date at the top tells you when. Material changes will be announced on the
          Service before they take effect; continuing to use the Service after that means you accept them. We may
          suspend or end your access to the Service at any time; because your wallet and positions are yours, ending
          access to the Service never takes them away from you, and you can always manage them directly on chain.
        </p>
        <p>
          You are responsible for any taxes arising from your activity. You agree to receive notices from us
          electronically. If any part of these Terms is unenforceable, the rest still applies. These Terms, with the
          Privacy Policy and Disclosures, are the whole agreement between you and us about the Service. You may not
          transfer your rights under these Terms; we may transfer ours to a successor of the business.
        </p>
      </Section>

      <Section title="15. Contact">
        <p>
          {OPERATOR} · <ContactEmail />
        </p>
      </Section>
    </LegalPage>
  );
}
