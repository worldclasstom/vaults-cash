import { NextResponse, type NextRequest } from "next/server";
import { createWalletClient, formatEther, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodChain } from "@/lib/chain";
import { ensureSchema, sql } from "@/lib/db";
import { publicClient } from "@/lib/onchain";
import { verifyPrivyToken } from "@/lib/referral";

/**
 * One-time network-fee starter: sends a sliver of ETH to a new user's wallet
 * so they never have to acquire gas themselves. Interim measure until an
 * ERC-20 (USDG) paymaster is available on chain 4663.
 *
 * Abuse bounds: one drip per verified Privy account (DB PK), only to wallets
 * with effectively zero ETH, and the ops wallet holds only a small float.
 */
const DRIP_AMOUNT = parseEther("0.0001"); // ~$0.17 ≈ 10–15 operations
const ALREADY_FUNDED_THRESHOLD = parseEther("0.00002");

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });
    const did = await verifyPrivyToken(token);

    const { wallet } = await req.json();
    if (typeof wallet !== "string" || !isAddress(wallet))
      return NextResponse.json({ error: "wallet required" }, { status: 400 });

    const key = process.env.GAS_DRIP_PRIVATE_KEY as `0x${string}` | undefined;
    if (!key) return NextResponse.json({ dripped: false, reason: "drip not configured" });

    await ensureSchema();
    const q = sql();
    const existing = await q`SELECT tx_hash FROM gas_drips WHERE privy_did = ${did}`;
    if (existing.length)
      return NextResponse.json({ dripped: false, reason: "already dripped" });

    const balance = await publicClient.getBalance({ address: wallet as `0x${string}` });
    if (balance > ALREADY_FUNDED_THRESHOLD)
      return NextResponse.json({ dripped: false, reason: "wallet already funded" });

    const account = privateKeyToAccount(key);
    const opsBalance = await publicClient.getBalance({ address: account.address });
    if (opsBalance < DRIP_AMOUNT * 2n)
      return NextResponse.json(
        { dripped: false, reason: `drip wallet low (${formatEther(opsBalance)} ETH)` },
        { status: 503 },
      );

    // claim the drip BEFORE sending — a concurrent duplicate loses the insert
    const claimed = await q`
      INSERT INTO gas_drips (privy_did, wallet, tx_hash)
      VALUES (${did}, ${wallet.toLowerCase()}, 'pending')
      ON CONFLICT (privy_did) DO NOTHING RETURNING privy_did`;
    if (!claimed.length)
      return NextResponse.json({ dripped: false, reason: "already dripped" });

    const walletClient = createWalletClient({
      account,
      chain: robinhoodChain,
      transport: http(),
    });
    const hash = await walletClient.sendTransaction({
      to: wallet as `0x${string}`,
      value: DRIP_AMOUNT,
    });
    await q`UPDATE gas_drips SET tx_hash = ${hash} WHERE privy_did = ${did}`;
    await publicClient.waitForTransactionReceipt({ hash });

    return NextResponse.json({ dripped: true, txHash: hash });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
