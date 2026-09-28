/** A short server-side cache of each user's ladder list: the list reads every
 *  rung live on chain, and a page refresh shouldn't do that twice in 15 s.
 *  Writes that change a ladder (create, close, cancel, collect) drop the entry. */
const TTL_MS = 15_000;
const cache = new Map<string, { at: number; body: unknown }>();

export function cachedLadderList(did: string): unknown | undefined {
  const hit = cache.get(did);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(did);
    return undefined;
  }
  return hit.body;
}
export function rememberLadderList(did: string, body: unknown) {
  if (cache.size > 500) cache.clear();
  cache.set(did, { at: Date.now(), body });
}
export function forgetLadderList(did: string) {
  cache.delete(did);
}
