import { NextResponse, type NextRequest } from "next/server";
import { indexAllChains } from "@/lib/swapIndex";

export const maxDuration = 60;

/**
 * Advances the swap index (see lib/swapIndex.ts). Hit by Vercel cron every
 * five minutes. When CRON_SECRET is set, only calls carrying it run; without
 * it the route is still safe to expose: idempotent, work-bounded, and it
 * writes only what the chain says.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const runs = await indexAllChains();
    return NextResponse.json(
      runs.map((r) => ({ chainId: r.chainId, from: r.from.toString(), to: r.to.toString(), inserted: r.inserted, done: r.done })),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    // never echo provider errors: they can carry RPC URLs with keys
    console.error("cron/swaps", (e as Error).message);
    return NextResponse.json({ error: "index run failed" }, { status: 500 });
  }
}
