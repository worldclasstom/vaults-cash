/**
 * Server-side enumeration of a wallet's Uniswap v4 position NFTs (token ids
 * of PositionManager ERC-721s). Ownership and liquidity are re-read from the
 * chain afterwards, so this only has to be *complete*, not fresh.
 *
 * Sources, in order: Alchemy NFT API (key is origin-allowlisted, so the
 * server sends Origin: https://vaults.cash), then Blockscout. Either one
 * being slow or down no longer blanks the portfolio.
 */
import { EXPLORER, UNISWAP } from "./chain";

const POSM = UNISWAP.v4.positionManager;
const withTimeout = (ms: number) => ({ signal: AbortSignal.timeout(ms) });

async function viaAlchemy(owner: string): Promise<bigint[] | null> {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return null;
  const ids: bigint[] = [];
  let pageKey: string | undefined;
  do {
    const url = new URL(`https://base-mainnet.g.alchemy.com/nft/v3/${key}/getNFTsForOwner`);
    url.searchParams.set("owner", owner);
    url.searchParams.append("contractAddresses[]", POSM);
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

async function viaBlockscout(owner: string): Promise<bigint[]> {
  const res = await fetch(`${EXPLORER.apiUrl}/addresses/${owner}/nft?type=ERC-721`, {
    headers: { accept: "application/json" },
    ...withTimeout(6_000),
  });
  if (res.status === 404) return []; // address unseen by the indexer yet
  if (!res.ok) throw new Error(`Blockscout ${res.status}`);
  const body = await res.json();
  return (body.items ?? [])
    .filter((item: { token?: { address?: string; address_hash?: string } }) => {
      const addr = item.token?.address ?? item.token?.address_hash ?? "";
      return addr.toLowerCase() === POSM.toLowerCase();
    })
    .map((item: { id: string }) => BigInt(item.id));
}

/** Candidate position token ids for `owner`. Throws only when every source failed. */
export async function positionTokenIds(owner: `0x${string}`): Promise<bigint[]> {
  let lastError: unknown;
  for (const source of [viaAlchemy, viaBlockscout]) {
    try {
      const ids = await source(owner);
      if (ids) return ids;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error("no NFT source configured");
}
