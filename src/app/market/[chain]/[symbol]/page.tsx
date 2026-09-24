import { notFound } from "next/navigation";
import { MarketDetail } from "@/components/MarketDetail";
import { MARKETS, marketBySlug } from "@/lib/markets";

/** /market/<chain>/<symbol> — chain in the path, the convention multi-chain
 *  DeFi frontends converge on (Uniswap, Morpho, Aave all key routes by
 *  chain), so links are unambiguous and shareable. */
export function generateStaticParams() {
  return MARKETS.map((m) => {
    const [chain, symbol] = m.slug.split("/");
    return { chain, symbol };
  });
}

export default async function MarketPage({
  params,
}: {
  params: Promise<{ chain: string; symbol: string }>;
}) {
  const { chain, symbol } = await params;
  const slug = `${chain}/${symbol}`.toLowerCase();
  const market = marketBySlug(slug);
  if (!market || market.slug !== slug) notFound();
  return <MarketDetail slug={slug} />;
}
