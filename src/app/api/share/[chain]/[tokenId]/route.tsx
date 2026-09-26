import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chainBySlug } from "@/lib/chain";
import { getMarketPricing } from "@/lib/onchain";
import { getUncollectedFees, readPosition } from "@/lib/positions";
import { sharePrice } from "@/lib/markets";

/**
 * The share card: a real position, live numbers, our voice. 1200×630 so it
 * works as an Open Graph image and as a saved picture.
 */
export const runtime = "nodejs";

const fmtUsd = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function Sticker({ children, bg, color = "#000", rotate = -3, size = 26 }: { children: string; bg: string; color?: string; rotate?: number; size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        background: bg,
        color,
        border: "4px solid #f4f6f4",
        borderRadius: 999,
        padding: `${size * 0.3}px ${size * 0.77}px`,
        fontSize: size,
        fontWeight: 700,
        transform: `rotate(${rotate}deg)`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.45)",
      }}
    >
      {children}
    </div>
  );
}

export async function GET(req: Request, ctx: { params: Promise<{ chain: string; tokenId: string }> }) {
  const { chain, tokenId } = await ctx.params;
  // ?format=story → 1080×1920, the size Instagram/TikTok stories expect
  const story = new URL(req.url).searchParams.get("format") === "story";
  const size = story ? { width: 1080, height: 1920 } : { width: 1200, height: 630 };
  const cfg = chainBySlug(chain);
  const [bold, medium] = await Promise.all([
    readFile(join(process.cwd(), "assets/Geist-Bold.ttf")),
    readFile(join(process.cwd(), "assets/Geist-Medium.ttf")),
  ]);
  const fonts = [
    { name: "Geist", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Geist", data: medium, weight: 500 as const, style: "normal" as const },
  ];
  const position = cfg && /^\d+$/.test(tokenId) ? await readPosition(cfg.chain.id as 8453 | 4663, BigInt(tokenId)) : null;

  if (!position || !cfg) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0d0b", color: "#f4f6f4", fontFamily: "Geist", fontSize: 48, fontWeight: 700 }}>
          vaults<span style={{ color: "#7cd44a" }}>.cash</span>
        </div>
      ),
      { ...size, fonts },
    );
  }

  const m = position.market;
  const [{ state, price, quoteUsd, priceUsd }, fees] = await Promise.all([getMarketPricing(m), getUncollectedFees(position).catch(() => ({ owed0: 0n, owed1: 0n }))]);
  const c0 = m.baseIsCurrency0;
  const baseOwed = Number(c0 ? fees.owed0 : fees.owed1) / 10 ** m.base.decimals;
  const quoteOwed = Number(c0 ? fees.owed1 : fees.owed0) / 10 ** m.quote.decimals;
  const feesUsd = (baseOwed * price + quoteOwed) * quoteUsd;
  const inRange = state.tick >= position.tickLower && state.tick < position.tickUpper;
  const chainSticker = cfg.chain.id === 8453 ? { bg: "#0052ff", color: "#fff" } : { bg: "#00c805", color: "#000" };

  if (story) {
    const priceLine = `now $${sharePrice(m, priceUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0d0b", color: "#f4f6f4", fontFamily: "Geist", padding: "160px 80px 200px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>
              vaults<span style={{ color: "#7cd44a" }}>.cash</span>
            </div>
            <div style={{ display: "flex", gap: 24 }}>
              <Sticker bg={chainSticker.bg} color={chainSticker.color} rotate={2} size={40}>{cfg.label}</Sticker>
              <Sticker bg={inRange ? "#7cd44a" : "#ff5c5c"} color={inRange ? "#000" : "#fff"} rotate={-3} size={40}>{inRange ? "Earning" : "Out of range"}</Sticker>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 500, color: "#8b938b" }}>Traders paid me</div>
            <div style={{ display: "flex", fontSize: 200, fontWeight: 700, letterSpacing: -10, color: "#7cd44a", lineHeight: 1 }}>+{fmtUsd(feesUsd)}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 24, fontSize: 84, fontWeight: 700, marginTop: 24 }}>
              {m.base.symbol} <span style={{ color: "#8b938b" }}>/</span> {m.quote.symbol}
            </div>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 500, color: "#8b938b" }}>{priceLine} · Uniswap v4 · held in my own wallet</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, fontSize: 40, color: "#8b938b", fontWeight: 500 }}>
            <div style={{ display: "flex" }}>Every trade pays a fee. Be the one collecting it.</div>
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
            <Sticker bg={chainSticker.bg} color={chainSticker.color} rotate={2}>{cfg.label}</Sticker>
            <Sticker bg={inRange ? "#7cd44a" : "#ff5c5c"} color={inRange ? "#000" : "#fff"} rotate={-3}>{inRange ? "Earning" : "Out of range"}</Sticker>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 500, color: "#8b938b" }}>Traders paid me</div>
          <div style={{ display: "flex", fontSize: 132, fontWeight: 700, letterSpacing: -6, color: "#7cd44a", lineHeight: 1 }}>+{fmtUsd(feesUsd)}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, fontSize: 44, fontWeight: 700, marginTop: 8 }}>
            {m.base.symbol} <span style={{ color: "#8b938b" }}>/</span> {m.quote.symbol}
            <span style={{ fontSize: 28, fontWeight: 500, color: "#8b938b" }}>now ${sharePrice(m, priceUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })} · Uniswap v4 · held in my own wallet</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, color: "#8b938b", fontWeight: 500 }}>
          <div style={{ display: "flex" }}>Every trade pays a fee. Be the one collecting it.</div>
          <div style={{ display: "flex" }}>vaults.cash</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts, headers: { "cache-control": "public, max-age=60" } },
  );
}
