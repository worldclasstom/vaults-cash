import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt =
  "vaults.cash — Every trade pays a fee. Be the one collecting it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The brand mark, sized up for the card (same geometry as icon.svg). */
function Mark({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect width="64" height="64" rx="14" fill="#141714" />
      <g transform="rotate(-8 32 32)">
        <path d="M10 46c14 5 30 5 44 0v5c-14 5-30 5-44 0v-5Z" fill="#3e8f2b" opacity={0.55} />
        <path d="M10 38c14 5 30 5 44 0v5c-14 5-30 5-44 0v-5Z" fill="#54ad35" opacity={0.8} />
        <rect x="10" y="14" width="44" height="18" rx="4" fill="#7cd44a" />
        <rect x="16" y="18" width="32" height="10" rx="2" fill="#2f7a1e" />
        <rect x="27" y="19.5" width="10" height="7" rx="3" fill="#7cd44a" />
      </g>
    </svg>
  );
}

export default async function OgImage() {
  // process.cwd() is the Next.js project directory (per docs)
  const [bold, medium] = await Promise.all([
    readFile(join(process.cwd(), "assets/Geist-Bold.ttf")),
    readFile(join(process.cwd(), "assets/Geist-Medium.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#0b0d0b",
          backgroundImage:
            "radial-gradient(900px 500px at 85% -10%, rgba(124,212,74,0.22), rgba(11,13,11,0))",
          fontFamily: "Geist",
        }}
      >
        <Mark s={104} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 84,
            fontWeight: 700,
            lineHeight: 1.06,
            letterSpacing: "-0.03em",
            color: "#f4f6f4",
          }}
        >
          <span>Every trade pays a fee.</span>
          <span style={{ display: "flex" }}>
            Be the one&nbsp;<span style={{ color: "#7cd44a" }}>collecting it</span>.
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#f4f6f4" }}>
            vaults<span style={{ color: "#7cd44a" }}>.cash</span>
          </div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: "#8b938b" }}>
            Live on Base and Robinhood Chain
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: bold, weight: 700, style: "normal" },
        { name: "Geist", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
