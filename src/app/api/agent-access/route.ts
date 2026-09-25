import { NextResponse, type NextRequest } from "next/server";
import { verifyPrivyToken } from "@/lib/referral";
import { createAgentKey, listAgentKeys, privyWallets, revokeAgentKeys } from "@/lib/agentAccess";

/**
 * Account-linked agent access, for the signed-in user only (Privy JWT).
 *   GET    → { signerId, delegated, embedded, smartWallet, keys[] }
 *   POST   { label? } → { key (shown once), id }
 *   DELETE { id? }    → revoke one key or all of them
 * Granting/revoking the session signer itself happens client-side through
 * Privy; this route only reports it.
 */
async function user(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Response("missing token", { status: 401 });
  try {
    return await verifyPrivyToken(token);
  } catch {
    throw new Response("invalid token", { status: 401 });
  }
}

const fail = (e: unknown) =>
  e instanceof Response ? e : NextResponse.json({ error: (e as Error).message }, { status: 500 });

export async function GET(req: NextRequest) {
  try {
    const did = await user(req);
    const [wallets, keys] = await Promise.all([privyWallets(did), listAgentKeys(did)]);
    return NextResponse.json({
      signerId: process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID ?? null,
      policyId: process.env.NEXT_PUBLIC_PRIVY_SIGNER_POLICY_ID ?? null,
      delegated: wallets.embedded?.delegated ?? false,
      embedded: wallets.embedded?.address ?? null,
      smartWallet: wallets.smartWallet,
      keys,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const did = await user(req);
    const body = (await req.json().catch(() => ({}))) as { label?: string };
    const wallets = await privyWallets(did);
    if (!wallets.smartWallet) return NextResponse.json({ error: "no smart wallet on this account" }, { status: 400 });
    const label = typeof body.label === "string" ? body.label.slice(0, 40) : undefined;
    return NextResponse.json(await createAgentKey(did, wallets.smartWallet, label));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const did = await user(req);
    const body = (await req.json().catch(() => ({}))) as { id?: number };
    return NextResponse.json({ revoked: await revokeAgentKeys(did, typeof body.id === "number" ? body.id : undefined) });
  } catch (e) {
    return fail(e);
  }
}
