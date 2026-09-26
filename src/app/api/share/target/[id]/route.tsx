import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ladderById, ladderView } from "@/lib/ladders";
import { fmtPrice, fmtUsd } from "@/lib/format";
import { marketBySlug, sharePrice } from "@/lib/markets";

export const dynamic = "force-dynamic";

function Sticker({ children, bg, color = "#000", rotate = -3, size = 26 }: { children: string; bg: string; color?: string; rotate?: number; size?: number }) {
  return (
    <div style={{ display: "flex", background: bg, color, border: "4px solid #f4f6f4", borderRadius: 999, padding: `${size * 0.3}px ${size * 0.77}px`, fontSize: size, fontWeight: 700, transform: `rotate(${rotate}deg)`, boxShadow: "0 4px 12px rgba(0,0,0,0.45)" }}>
      {children}
    </div>
  );
}

/**
 * A target's share card: the belief, the outcome, what traders paid on
 * the way. Landscape for links, ?format=story for a 1080×1920 image.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const story = new URL(req.url).searchParams.get("format") === "story";
  const size = story ? { width: 1080, height: 1920 } : { width: 1200, height: 630 };
  const [bold, medium] = await Promise.all([readFile(join(process.cwd(), "assets/Geist-Bold.ttf")), readFile(join(process.cwd(), "assets/Geist-Medium.ttf"))]);
  const fonts = [
    { name: "Geist", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Geist", data: medium, weight: 500 as const, style: "normal" as const },
  ];
  const full = /^\d+$/.test(id) ? await ladderById(Number(id)).catch(() => null) : null;
  const view = full ? await ladderView(full.ladder, full.rungs).catch(() => null) : null;
  const market = view ? marketBySlug(view.marketSlug) : undefined;
  if (!view || !market) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0d0b", color: "#f4f6f4", fontFamily: "Geist", fontSize: 48, fontWeight: 700 }}>
          vaults<span style={{ color: "#7cd44a" }}>.cash</span>
        </div>
      ),
      { ...size, fonts },
    );
  }
  const paid = view.feesUsd + view.feesPaidUsd;
  const hit = view.status === "hit" || view.status === "closed" || (view.total > 0 && view.done === view.total);
  const days = Math.max(1, Math.round((Date.now() - new Date(view.createdAt).getTime()) / 86_400_000));
  const chain = view.chainId === 8453 ? { bg: "#0052ff", color: "#fff" } : { bg: "#00c805", color: "#000" };
  const arrow = view.direction === "up" ? "→" : "↓";
  const headline = `${view.base} $${fmtPrice(sharePrice(market, view.startPrice))} ${arrow} $${fmtPrice(sharePrice(market, view.targetPrice))}`;
  const status = hit ? "Target hit" : view.status === "expired" ? "Expired" : view.direction === "up" ? "Climbing" : "Filling";
  const sub = `${view.total} rungs · ${days} day${days === 1 ? "" : "s"} · ${view.done} of ${view.total} ${view.direction === "up" ? "sold" : "filled"}`;
  const paidLabel = hit ? "Traders paid me on the way" : "Traders paid me so far";

  if (story) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0d0b", color: "#f4f6f4", fontFamily: "Geist", padding: "280px 80px 300px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>
              vaults<span style={{ color: "#7cd44a" }}>.cash</span>
            </div>
            <div style={{ display: "flex", gap: 24 }}>
              <Sticker bg={chain.bg} color={chain.color} rotate={2} size={40}>{view.chain}</Sticker>
              <Sticker bg={hit ? "#7cd44a" : "#ffd23f"} color="#000" rotate={-3} size={40}>{status}</Sticker>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 500, color: "#8b938b" }}>{paidLabel}</div>
            <div style={{ display: "flex", fontSize: 200, fontWeight: 700, letterSpacing: -10, color: "#7cd44a", lineHeight: 1 }}>+{fmtUsd(paid)}</div>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 700, marginTop: 24 }}>{headline}</div>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 500, color: "#8b938b" }}>{sub}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, fontSize: 40, color: "#8b938b", fontWeight: 500 }}>
            <div style={{ display: "flex" }}>Pick a price you believe in. Earn on every step there.</div>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: "#f4f6f4" }}>vaults.cash</div>
          </div>
        </div>
      ),
      { ...size, fonts, headers: { "cache-control": "public, max-age=60" } },
    );
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0d0b", color: "#f4f6f4", fontFamily: "Geist", padding: 64 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 700 }}>
            vaults<span style={{ color: "#7cd44a" }}>.cash</span>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <Sticker bg={chain.bg} color={chain.color} rotate={2}>{view.chain}</Sticker>
            <Sticker bg={hit ? "#7cd44a" : "#ffd23f"} color="#000" rotate={-3}>{status}</Sticker>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 500, color: "#8b938b" }}>{paidLabel}</div>
          <div style={{ display: "flex", fontSize: 132, fontWeight: 700, letterSpacing: -6, color: "#7cd44a", lineHeight: 1 }}>+{fmtUsd(paid)}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, fontSize: 44, fontWeight: 700, marginTop: 8 }}>
            {headline}
            <span style={{ fontSize: 28, fontWeight: 500, color: "#8b938b" }}>{sub}</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, color: "#8b938b", fontWeight: 500 }}>
          <div style={{ display: "flex" }}>Pick a price you believe in. Earn on every step there.</div>
          <div style={{ display: "flex" }}>vaults.cash</div>
        </div>
      </div>
    ),
    { ...size, fonts, headers: { "cache-control": "public, max-age=60" } },
  );
}
