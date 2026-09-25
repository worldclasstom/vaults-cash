import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest } from "@/lib/sameOrigin";
import { bridgeStatus } from "@/lib/bridge";

export async function GET(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("requestId") ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return NextResponse.json({ error: "bad requestId" }, { status: 400 });
  try {
    return NextResponse.json(await bridgeStatus(id), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
