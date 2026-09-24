import { chainConfig, type ChainId } from "./chain";

/** Server-side RPC endpoint per chain: the private URL from env, else
 *  Alchemy (key is origin-allowlisted — callers send Origin), else the
 *  chain's public RPC. Server only: never import from client code. */
export function serverRpcUrl(chainId: ChainId): string {
  const cfg = chainConfig(chainId);
  const fromEnv = chainId === 8453 ? process.env.BASE_RPC_URL : process.env.ROBINHOOD_RPC_URL;
  if (fromEnv) return fromEnv;
  const key = process.env.ALCHEMY_API_KEY;
  if (key) return `https://${cfg.alchemy}.g.alchemy.com/v2/${key}`;
  return cfg.chain.rpcUrls.default.http[0];
}
