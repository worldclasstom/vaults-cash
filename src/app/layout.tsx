import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Providers } from "./providers";

// Fonts ship with the app: Geist from Vercel's package, Bricolage from a
// bundled file. Fetching them from Google at build time failed twice.
const geistSans = GeistSans; // exposes --font-geist-sans
const geistMono = GeistMono; // exposes --font-geist-mono

// the Sticker Ledger's display voice: headings, pair names, money, buttons
const bricolage = localFont({
  src: "./fonts/BricolageGrotesque.ttf",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0b0d0b",
  viewportFit: "cover", // bottom tab bar respects the iPhone home indicator
};

export const metadata: Metadata = {
  metadataBase: new URL("https://vaults.cash"),
  // lead with the product, not the chain: the simple way to earn what traders pay
  title: { default: "vaults.cash — earn what traders pay", template: "%s — vaults.cash" },
  description:
    "Every trade pays a fee. Be the one collecting it. One tap turns your dollars into an earning position in ETH, Bitcoin or stock tokens — self-custodial, on Base and Robinhood Chain.",
  openGraph: {
    siteName: "vaults.cash",
    type: "website",
    url: "https://vaults.cash",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
