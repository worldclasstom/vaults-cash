import { notFound, permanentRedirect } from "next/navigation";
import { marketBySymbol } from "@/lib/markets";

/** Old links (/market/eth, referral links in the wild, the interim
 *  /market/eth-robinhood form) → the canonical /market/<chain>/<symbol>. */
export default async function LegacyMarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { symbol } = await params;
  const market = marketBySymbol(symbol);
  if (!market) notFound();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const suffix = qs.size ? `?${qs}` : "";
  permanentRedirect(`/market/${market.slug}${suffix}`);
}
