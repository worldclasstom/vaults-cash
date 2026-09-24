/**
 * Server-side enumeration of a wallet's Uniswap v4 position NFTs (token ids
 * of PositionManager ERC-721s). Ownership and liquidity are re-read from the
 * chain afterwards, so this only has to be *complete*, not fresh.
 *
 * Sources, in order:
 *   1. Alchemy NFT API (both chains; key is origin-allowlisted, so the server
 *      sends Origin: https://vaults.cash)
 *   2. Blockscout (Base only — Robinhood's sits behind a Cloudflare challenge)
 *   3. RPC Transfer logs (Robinhood only — its public RPC serves whole-chain
 *      ranges; Base's CDP RPC rejects anything beyond a few thousand blocks)
 */
import { parseAbiItem } from "viem";
import { chainConfig, type ChainId } from "./chain";
import { publicClientFor } from "./onchain";

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);

const withTimeout = (ms: number) => ({ signal: AbortSignal.timeout(ms) });

async function viaAlchemy(chainId: ChainId, owner: string, posm: string): Promise<bigint[] | null> {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return null;
  const cfg = chainConfig(chainId);
  const ids: bigint[] = [];
  let pageKey: string | undefined;
  do {
    const url = new URL(`https://${cfg.alchemy}.g.alchemy.com/nft/v3/${key}/getNFTsForOwner`);
    url.searchParams.set("owner", owner);
    url.searchParams.append("contractAddresses[]", posm);
    url.searchParams.set("withMetadata", "false");
    url.searchParams.set("pageSize", "100");
    if (pageKey) url.searchParams.set("pageKey", pageKey);
    const res = await fetch(url, {
      headers: { accept: "application/json", Origin: "https://vaults.cash" },
      ...withTimeout(6_000),
    });
    if (!res.ok) throw new Error(`Alchemy NFT ${res.status}`);
    const body = await res.json();
    for (const n of body.ownedNfts ?? []) ids.push(BigInt(n.tokenId));
    pageKey = body.pageKey ?? undefined;
  } while (pageKey);
  return ids;
}

async function viaBlockscout(chainId: ChainId, owner: string, posm: string): Promise<bigint[]> {
  const api = chainConfig(chainId).explorer.apiUrl;
  const res = await fetch(`${api}/addresses/${owner}/nft?type=ERC-721`, {
    headers: { accept: "application/json" },
    ...withTimeout(6_000),
  });
  if (res.status === 404) return []; // address unseen by the indexer yet
  if (!res.ok) throw new Error(`Blockscout ${res.status}`);
  const body = await res.json();
  return (body.items ?? [])
    .filter((item: { token?: { address?: string; address_hash?: string } }) => {
      const addr = item.token?.address ?? item.token?.address_hash ?? "";
      return addr.toLowerCase() === posm.toLowerCase();
    })
    .map((item: { id: string }) => BigInt(item.id));
}

async function viaLogs(chainId: ChainId, owner: `0x${string}`, posm: `0x${string}`): Promise<bigint[]> {
  const logs = await publicClientFor(chainId).getLogs({
    address: posm,
    event: TRANSFER,
    args: { to: owner },
    fromBlock: 0n,
    toBlock: "latest",
  });
  return [...new Set(logs.map((l) => l.args.tokenId!))];
}

/** Candidate position token ids for `owner` on one chain. Throws only when
 *  every source failed. */
export async function positionTokenIds(chainId: ChainId, owner: `0x${string}`): Promise<bigint[]> {
  const posm = chainConfig(chainId).uniswap.v4.positionManager;
  const sources: Array<() => Promise<bigint[] | null>> = [
    () => viaAlchemy(chainId, owner, posm),
    chainId === 8453 ? () => viaBlockscout(chainId, owner, posm) : () => viaLogs(chainId, owner, posm),
  ];
  let lastError: unknown;
  for (const source of sources) {
    try {
      const ids = await source();
      if (ids) return ids;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error("no NFT source configured");
}
