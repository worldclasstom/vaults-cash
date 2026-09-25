import { neon } from "@neondatabase/serverless";

/** Neon serverless SQL client (DATABASE_URL provisioned via Vercel). */
export function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not configured");
  return neon(url);
}

let schemaReady: Promise<void> | null = null;

/** Idempotent schema bootstrap; runs once per lambda instance. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const q = sql();
      await q`CREATE TABLE IF NOT EXISTS users (
        id serial PRIMARY KEY,
        privy_did text UNIQUE NOT NULL,
        wallet text UNIQUE NOT NULL,
        ref_code text UNIQUE NOT NULL,
        referred_by text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS fee_events (
        id serial PRIMARY KEY,
        tx_hash text NOT NULL,
        log_index int NOT NULL,
        payer text NOT NULL,
        amount numeric NOT NULL,
        block_number bigint NOT NULL,
        referrer_wallet text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tx_hash, log_index)
      )`;
      await q`CREATE INDEX IF NOT EXISTS fee_events_referrer_idx ON fee_events (referrer_wallet)`;
      // the fee is the chain's stablecoin in raw 6-decimal units (USDG on
      // Robinhood, USDC on Base — chain_id says which), so the column is just
      // `amount`. It was born as amount_usdg in July and briefly amount_usdc;
      // CREATE IF NOT EXISTS never renames, so migrate whichever exists.
      await q`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fee_events' AND column_name = 'amount_usdg') THEN
          ALTER TABLE fee_events RENAME COLUMN amount_usdg TO amount;
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fee_events' AND column_name = 'amount_usdc') THEN
          ALTER TABLE fee_events RENAME COLUMN amount_usdc TO amount;
        END IF;
      END $$`;
      // fees are paid in the chain's dollar stablecoin (USDC on Base, USDG on
      // Robinhood); rows predating multi-chain are all Base
      await q`ALTER TABLE fee_events ADD COLUMN IF NOT EXISTS chain_id int NOT NULL DEFAULT 8453`;
      await q`CREATE TABLE IF NOT EXISTS sync_state (
        k text PRIMARY KEY,
        v text NOT NULL
      )`;
      // every address a user has paid from (embedded EOA in the CDP era,
      // Privy smart wallet now) — fee attribution matches payers here, so a
      // wallet change never orphans a referral
      await q`CREATE TABLE IF NOT EXISTS user_wallets (
        wallet text PRIMARY KEY,
        privy_did text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`INSERT INTO user_wallets (wallet, privy_did) SELECT wallet, privy_did FROM users ON CONFLICT DO NOTHING`;
      // referrer share: paid on-chain in the same batch as the fee since the
      // fee split shipped (referrer_amount = what the referrer received)
      await q`ALTER TABLE fee_events ADD COLUMN IF NOT EXISTS referrer_did text`;
      await q`ALTER TABLE fee_events ADD COLUMN IF NOT EXISTS referrer_amount numeric NOT NULL DEFAULT 0`;
      // account keys for agents acting on a user's own wallet (MCP/REST
      // bearer). Only the sha256 of the key is stored; the key itself is
      // shown once.
      await q`CREATE TABLE IF NOT EXISTS agent_keys (
        id serial PRIMARY KEY,
        privy_did text NOT NULL,
        wallet text NOT NULL,
        key_hash text UNIQUE NOT NULL,
        label text,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz,
        revoked_at timestamptz
      )`;
      await q`CREATE INDEX IF NOT EXISTS agent_keys_did_idx ON agent_keys (privy_did)`;
    })();
  }
  return schemaReady;
}
