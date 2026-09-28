/**
 * Persist the React Query cache in localStorage so a reload paints the
 * last-known pools, balances and ladders at once and the fresh numbers
 * replace them a moment later. Only read-model queries are kept, all of
 * them keyed by wallet where they are per-user; logout wipes the store.
 * BigInt / Map / Set survive the round trip through a tagged encoding.
 */
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Persister } from "@tanstack/react-query-persist-client";
import type { Query } from "@tanstack/react-query";

export const PERSIST_KEY = "vaults.query.v1";
export const PERSIST_BUSTER = "v1";
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

const KEEP = new Set(["market-quotes", "market-quote", "stats", "cash-balances", "usdc-balance", "asset-balances", "token-balance", "positions", "ladders", "ladder", "referral-me"]);

export function shouldPersistQuery(q: Query): boolean {
  const k = q.queryKey[0];
  return typeof k === "string" && KEEP.has(k) && q.state.status === "success";
}

type Tagged = { __t: "bigint" | "map" | "set"; v: unknown };
function replacer(this: unknown, _k: string, v: unknown): unknown {
  if (typeof v === "bigint") return { __t: "bigint", v: v.toString() } satisfies Tagged;
  if (v instanceof Map) return { __t: "map", v: [...v] } satisfies Tagged;
  if (v instanceof Set) return { __t: "set", v: [...v] } satisfies Tagged;
  return v;
}
function reviver(_k: string, v: unknown): unknown {
  if (v && typeof v === "object" && "__t" in v) {
    const t = v as Tagged;
    if (t.__t === "bigint") return BigInt(t.v as string);
    if (t.__t === "map") return new Map(t.v as Array<[unknown, unknown]>);
    if (t.__t === "set") return new Set(t.v as unknown[]);
  }
  return v;
}

const noop: Persister = { persistClient: () => undefined, restoreClient: () => undefined, removeClient: () => undefined };

/** localStorage-backed on the client; a no-op on the server and where storage is blocked. */
export function createPersister(): Persister {
  if (typeof window === "undefined") return noop;
  try {
    window.localStorage.getItem(PERSIST_KEY);
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: PERSIST_KEY,
      throttleTime: 1_000,
      serialize: (c) => JSON.stringify(c, replacer),
      deserialize: (s) => JSON.parse(s, reviver),
    });
  } catch {
    return noop;
  }
}

export function clearPersistedQueries() {
  try {
    window.localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* storage blocked */
  }
}

const AUTH_HINT = "vaults.authed";
/** Remembered across reloads so the first paint can pick the app shell or the landing page before Privy answers. */
export function rememberAuth(on: boolean) {
  try {
    window.localStorage.setItem(AUTH_HINT, on ? "1" : "0");
  } catch {
    /* storage blocked */
  }
}
export function likelyAuthenticated(): boolean {
  try {
    return window.localStorage.getItem(AUTH_HINT) === "1";
  } catch {
    return false;
  }
}
