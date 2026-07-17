import { NextResponse } from "next/server";
import { AGENT_DOCS, marketSnapshot } from "@/lib/agent";
import { MARKETS } from "@/lib/markets";

export const revalidate = 15;

export async function GET() {
  const markets = await Promise.all(MARKETS.map(marketSnapshot));
  return NextResponse.json({
    chainId: 8453,
    chainName: "Base",
    markets,
    docs: AGENT_DOCS,
  });
}
