import { notFound, permanentRedirect } from "next/navigation";
import { chainBySlug } from "@/lib/chain";
import { marketBySlug } from "@/lib/markets";

/** Old links → the canonical /market/<chain>/<base>-<quote>:
 *  /market/eth, /market/eth-usdc, /market/eth-robinhood (interim form), and
 *  a bare /market/base → the pool list. Query string (referral codes) kept. */
export default async function LegacyMarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ chain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { chain: key } = await params;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const suffix = qs.size ? `?${qs}` : "";
  if (chainBySlug(key)) permanentRedirect(`/pools${suffix}`);
  const market = marketBySlug(key);
  if (!market) notFound();
  permanentRedirect(`/market/${market.slug}${suffix}`);
}
