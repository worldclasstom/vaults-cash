import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// the Sticker Ledger's display voice: headings, pair names, money, buttons
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

export const viewport: Viewport = {
  themeColor: "#0b0d0b",
  viewportFit: "cover", // bottom tab bar respects the iPhone home indicator
};

export const metadata: Metadata = {
  metadataBase: new URL("https://vaults.cash"),
  title: "vaults.cash — earn on Base",
  description:
    "Every trade pays a fee. Be the one collecting it. Turn your USDC into earning liquidity positions on Base — tokenized stocks and blue-chip crypto, one tap.",
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
