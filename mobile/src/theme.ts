/** Sticker Ledger tokens, mirrored from the web app's globals.css. */
export const colors = {
  background: "#0b0d0b",
  surface: "#141714",
  surfaceRaised: "#1b1f1b",
  border: "#262b26",
  foreground: "#f4f6f4",
  muted: "#8b938b",
  accent: "#7cd44a",
  accentStrong: "#8ee55c",
  accentDeep: "#2f7a1e",
  negative: "#ff5c5c",
  stickerYellow: "#ffd23f",
  base: "#0052ff",
  robinhood: "#00c805",
  usdc: "#2775ca",
  eth: "#2b2f3a",
  ethInk: "#cdd3ff",
} as const;

/** Same faces as the web: Bricolage 800 for anything that shouts, Geist for prose, Geist Mono for figures. */
export const fonts = {
  display: "BricolageGrotesque-ExtraBold",
  body: "Geist-Regular",
  medium: "Geist-Medium",
  semibold: "Geist-SemiBold",
  bold: "Geist-Bold",
  mono: "GeistMono-Regular",
  monoMedium: "GeistMono-Medium",
} as const;

export const fontFiles = {
  [fonts.display]: require("../assets/fonts/BricolageGrotesque-ExtraBold.ttf"),
  [fonts.body]: require("../assets/fonts/Geist-Regular.ttf"),
  [fonts.medium]: require("../assets/fonts/Geist-Medium.ttf"),
  [fonts.semibold]: require("../assets/fonts/Geist-SemiBold.ttf"),
  [fonts.bold]: require("../assets/fonts/Geist-Bold.ttf"),
  [fonts.mono]: require("../assets/fonts/GeistMono-Regular.ttf"),
  [fonts.monoMedium]: require("../assets/fonts/GeistMono-Medium.ttf"),
};

export const radius = { card: 24, pill: 999, inner: 16 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** The sticker shadow: a small drop under every crooked label. */
export const stickerShadow = { shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 } as const;
