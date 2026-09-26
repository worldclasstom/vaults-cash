import { NextResponse, type NextRequest } from "next/server";
import { verifyPrivyToken } from "@/lib/referral";
import { privyWallets } from "@/lib/agentAccess";
import { executeForUser } from "@/lib/executor";

export const maxDuration = 60;

/**
 * Proves the whole agent-access path for THIS account with a harmless user
 * operation: a zero-value call from the smart wallet to itself on Base, where
 * gas is covered. If it lands, the keeper and the MCP can act on the wallet.
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const did = await verifyPrivyToken(token);
    const wallets = await privyWallets(did);
    if (!wallets.smartWallet) return NextResponse.json({ error: "no smart wallet on this account" }, { status: 400 });
    const r = await executeForUser(did, 8453, [{ to: wallets.smartWallet, value: 0n, data: "0x" }]);
    return NextResponse.json({ txHash: r.txHash, userOpHash: r.userOpHash, smartWallet: r.smartWallet });
  } catch (e) {
    const raw = (e as Error).message;
    console.error("agent-access/test", raw);
    // first line only, with any URL / request body stripped: provider errors carry keys
    const msg = raw.split("\n")[0].replace(/https?:\/\/\S+/g, "[url]").replace(/Request body:.*$/i, "").trim().slice(0, 160);
    return NextResponse.json({ error: msg || "test failed" }, { status: 500 });
  }
}
