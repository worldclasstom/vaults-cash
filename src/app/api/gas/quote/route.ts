import { NextResponse, type NextRequest } from "next/server";
import { isAddress, isHex } from "viem";
import { isSameOriginRequest } from "@/lib/sameOrigin";
import { CHAINS, type ChainId } from "@/lib/chain";
import { gasTokenContext } from "@/lib/gasToken";

const ENTRY_POINT_07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
// Alchemy simulates with a placeholder signature of the right length (their documented dummy)
const DUMMY_SIGNATURE =
  "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c";

/**
 * POST { chainId, sender, nonce, callData, factory?, factoryData? }
 * → { tokenAmount, usd } — what this op would cost in the chain's stablecoin
 * under the ERC-20 gas policy. Display only: the real charge is decided by the
 * paymaster when the op runs, capped by the approval the op carries.
 *
 * Alchemy's key is origin-allowlisted; server code presents the site's origin.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    chainId?: number;
    sender?: string;
    nonce?: string;
    callData?: string;
    factory?: string;
    factoryData?: string;
  };
  const chainId = Number(body.chainId) as ChainId;
  const cfg = CHAINS[chainId];
  const ctx = gasTokenContext(chainId);
  if (!cfg || !ctx) return NextResponse.json({ error: "no gas token on this chain" }, { status: 400 });
  if (!body.sender || !isAddress(body.sender) || !body.callData || !isHex(body.callData) || !body.nonce || !isHex(body.nonce)) {
    return NextResponse.json({ error: "sender, nonce and callData required" }, { status: 400 });
  }
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const userOperation = {
    sender: body.sender,
    nonce: body.nonce,
    callData: body.callData,
    ...(body.factory && isAddress(body.factory) && body.factoryData && isHex(body.factoryData)
      ? { factory: body.factory, factoryData: body.factoryData }
      : {}),
  };
  try {
    const r = await fetch(`https://${cfg.alchemy}.g.alchemy.com/v2/${key}`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: "https://vaults.cash" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_requestPaymasterTokenQuote",
        params: [{ policyId: ctx.policyId, entryPoint: ENTRY_POINT_07, dummySignature: DUMMY_SIGNATURE, userOperation, erc20Context: ctx.erc20Context }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const j = (await r.json()) as { result?: { estimateTokenAmount?: string; estimateUsd?: number; tokensPerEth?: string }; error?: { message: string } };
    if (j.error || !j.result) return NextResponse.json({ error: j.error?.message ?? "no quote" }, { status: 502 });
    return NextResponse.json(
      { tokenAmount: j.result.estimateTokenAmount, usd: j.result.estimateUsd, symbol: cfg.quote.symbol },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
