/**
 * App configuration. Metro inlines `process.env.EXPO_PUBLIC_*` at build time;
 * the shared web library (../../src/lib) reads `process.env.NEXT_PUBLIC_*`
 * at call time, so `bridgeEnv` copies the values across once at startup.
 */
import { setRpcOverride } from "@web/lib/onchain";

export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";
export const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? "";
export const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? "https://vaults.cash";
export const TARGETS_LIVE = process.env.EXPO_PUBLIC_TARGETS_LIVE === "1";

export function bridgeEnv() {
  const env = process.env as Record<string, string | undefined>;
  const pairs: Array<[string, string | undefined]> = [
    ["NEXT_PUBLIC_FEE_RECIPIENT", process.env.EXPO_PUBLIC_FEE_RECIPIENT],
    ["NEXT_PUBLIC_FEE_BPS", process.env.EXPO_PUBLIC_FEE_BPS],
    ["NEXT_PUBLIC_GAS_TOKEN_POLICY_4663", process.env.EXPO_PUBLIC_GAS_TOKEN_POLICY_4663],
    ["NEXT_PUBLIC_LADDER_CLOSER_8453", process.env.EXPO_PUBLIC_LADDER_CLOSER_8453],
    ["NEXT_PUBLIC_LADDER_CLOSER_4663", process.env.EXPO_PUBLIC_LADDER_CLOSER_4663],
    ["NEXT_PUBLIC_TARGETS_LIVE", process.env.EXPO_PUBLIC_TARGETS_LIVE],
  ];
  for (const [k, v] of pairs) if (v !== undefined && v !== "") env[k] = v;
  setRpcOverride(8453, process.env.EXPO_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org");
  setRpcOverride(4663, process.env.EXPO_PUBLIC_ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com");
}
