import { NextResponse } from "next/server";
import { syncFeeEvents } from "@/lib/referral";

export const maxDuration = 60;

/**
 * Ledger fee-wallet inflows. Hit hourly by Vercel cron and opportunistically
 * after deposits. Unauthenticated but safe: idempotent, work-bounded per
 * call, and writes only what the chain says.
 */
export async function GET() {
  try {
    return NextResponse.json(await syncFeeEvents());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
