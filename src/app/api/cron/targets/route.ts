import { NextResponse, type NextRequest } from "next/server";
import { ladderById, ladderHit, ladderView, openLadders, setLadderStatus } from "@/lib/ladders";
import { readPosition, type OwnedPosition } from "@/lib/positions";
import { buildLadderClosePlan } from "@/lib/targets";
import { executeForUser } from "@/lib/executor";
import { referrerWalletForUser } from "@/lib/agentAccess";
import type { ChainId } from "@/lib/chain";

export const maxDuration = 60;

/**
 * The Targets keeper. Every few minutes: for each open ladder, read the pool
 * and decide whether the target has printed or the ladder has expired. If
 * so and the user turned auto-close on (agent access granted), close it from
 * their own wallet through the session signer; otherwise mark it "hit" or
 * "expired" so the app asks them to close it. Nothing here ever holds funds.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const start = Date.now();
  const out: Array<{ id: number; result: string }> = [];
  try {
    for (const row of await openLadders()) {
      if (Date.now() - start > 45_000) break;
      try {
        const full = await ladderById(row.id);
        if (!full) continue;
        const view = await ladderView(full.ladder, full.rungs);
        const hit = ladderHit(view);
        const expired = !!row.expires_at && new Date(row.expires_at).getTime() < Date.now();
        // rungs all burned outside the app → nothing left to manage
        if (view.rungs.every((r) => !r.live)) {
          await setLadderStatus(row.id, "closed", {});
          out.push({ id: row.id, result: "closed elsewhere" });
          continue;
        }
        if (!hit && !expired) {
          out.push({ id: row.id, result: `open ${view.done}/${view.total}` });
          continue;
        }
        if (!row.auto_close) {
          await setLadderStatus(row.id, hit ? "hit" : "expired");
          out.push({ id: row.id, result: hit ? "hit — waiting for user" : "expired — waiting for user" });
          continue;
        }
        // auto-close from the user's own wallet
        const chainId = row.chain_id as ChainId;
        const positions = (await Promise.all(full.rungs.map((r) => readPosition(chainId, BigInt(r.token_id))))).filter(Boolean) as OwnedPosition[];
        const referrer = await referrerWalletForUser(row.privy_did).catch(() => null);
        const plan = await buildLadderClosePlan({
          positions,
          owner: row.wallet as `0x${string}`,
          mode: row.direction === "up" ? "cash" : "keep",
          slippageBps: 100,
          referrer,
        });
        const exec = await executeForUser(row.privy_did, chainId, plan.calls, { proceedsPayGas: true });
        await setLadderStatus(row.id, "closed", { closeTx: exec.txHash, feesPaidUsd: Number(plan.feesEarnedStable) / 1e6 });
        out.push({ id: row.id, result: `auto-closed ${exec.txHash}` });
      } catch (e) {
        // a failed close leaves the ladder marked so the user can close by hand
        await setLadderStatus(row.id, "hit").catch(() => undefined);
        out.push({ id: row.id, result: `error: ${(e as Error).message.slice(0, 160)}` });
      }
    }
    return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, partial: out }, { status: 500 });
  }
}
