import { NextResponse } from "next/server";
import { AGENT_DOCS, marketSnapshot } from "@/lib/agent";
import { CHAINS, CHAIN_IDS } from "@/lib/chain";
import { MARKETS } from "@/lib/markets";

export const revalidate = 15;

export async function GET() {
  const settled = await Promise.allSettled(MARKETS.map(marketSnapshot));
  const markets = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
  return NextResponse.json({
    chains: CHAIN_IDS.map((id) => ({
      chainId: id,
      name: CHAINS[id].chain.name,
      rpc: CHAINS[id].chain.rpcUrls.default.http[0],
      quote: CHAINS[id].quote,
      explorer: CHAINS[id].explorer.url,
    })),
    markets,
    docs: AGENT_DOCS,
  });
}
