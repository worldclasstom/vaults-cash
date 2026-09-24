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
        amount_usdc numeric NOT NULL,
        block_number bigint NOT NULL,
        referrer_wallet text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tx_hash, log_index)
      )`;
      await q`CREATE INDEX IF NOT EXISTS fee_events_referrer_idx ON fee_events (referrer_wallet)`;
      // the table was first created in the Robinhood/USDG era as amount_usdg;
      // CREATE IF NOT EXISTS never renamed it, so every stats query 500'd
      await q`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fee_events' AND column_name = 'amount_usdg') THEN
          ALTER TABLE fee_events RENAME COLUMN amount_usdg TO amount_usdc;
        END IF;
      END $$`;
      // fees are paid in the chain's dollar stablecoin (USDC on Base, USDG on
      // Robinhood); rows predating multi-chain are all Base
      await q`ALTER TABLE fee_events ADD COLUMN IF NOT EXISTS chain_id int NOT NULL DEFAULT 8453`;
      await q`CREATE TABLE IF NOT EXISTS sync_state (
        k text PRIMARY KEY,
        v text NOT NULL
      )`;
    })();
  }
  return schemaReady;
}
