import { notFound } from "next/navigation";
import { MarketDetail } from "@/components/MarketDetail";
import { marketBySymbol, MARKETS } from "@/lib/markets";

export function generateStaticParams() {
  return MARKETS.map((m) => ({ symbol: m.slug }));
}

export default async function MarketPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  if (!marketBySymbol(symbol)) notFound();
  return <MarketDetail symbol={symbol} />;
}
