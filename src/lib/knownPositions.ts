/**
 * Position NFT ids this browser has seen minted, per wallet + chain. The
 * NFT indexers (Alchemy/Blockscout) lag the chain by seconds to a minute, so
 * right after a deposit they still say "no positions". Ids remembered here
 * are merged into the indexer's candidates; ownership and liquidity are
 * always re-read from the chain, so a stale or foreign id is harmless.
 */
const KEY = "vaults.knownPositions.v1";

type Store = Record<string, string[]>; // `${chainId}:${owner}` -> tokenIds

const keyOf = (chainId: number, owner: string) => `${chainId}:${owner.toLowerCase()}`;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

export function rememberPosition(chainId: number, owner: string, tokenId: bigint) {
  try {
    const store = read();
    const k = keyOf(chainId, owner);
    const ids = new Set(store[k] ?? []);
    ids.add(tokenId.toString());
    store[k] = [...ids].slice(-50);
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private mode / storage blocked — the indexer catches up on its own */
  }
}

export function knownPositions(chainId: number, owner: string): bigint[] {
  if (typeof window === "undefined") return [];
  try {
    return (read()[keyOf(chainId, owner)] ?? []).map(BigInt);
  } catch {
    return [];
  }
}
