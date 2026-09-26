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
    const msg = (e as Error).message;
    console.error("agent-access/test", msg);
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}
