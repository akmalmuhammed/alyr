import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Instrument_Sans } from "next/font/google";
import { dark, semantic } from "../_tokens/tokens";
import "../_tokens/tokens.css";
import "../globals.css";

// The ALYR type: Instrument Sans, IBM Plex Sans Arabic, IBM Plex Mono (docs/brand.md). The
// variables carry the same names as on the public site, so one set of tokens
// (design/tokens.json) serves both.
const sans = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const arabic = IBM_Plex_Sans_Arabic({ variable: "--font-plex-arabic", subsets: ["arabic"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

// Product screens are for signed-in staff and for customers arriving by a private link.
// None of them belongs in a search engine.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_ALYR_SITE_URL ?? "https://alyr.qa"),
  title: "ALYR workspace",
  description: "The ALYR workspace for bookings, orders, payments and the team inbox.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: semantic.canvas },
    { media: "(prefers-color-scheme: dark)", color: dark.semantic.canvas },
  ],
};

// The theme the visitor chose with the public site's switch (localStorage `alyr-theme`,
// docs/brand.md "Light and dark"), put on <html> before the first paint so a dark choice
// never flashes light. With no choice stored the screens follow the device. A choice made
// in another tab is followed at once.
const THEME =
  "(function(){var r=document.documentElement,k='alyr-theme';function s(){var v=null;" +
  "try{v=localStorage.getItem(k)}catch(e){}if(v==='light'||v==='dark')r.setAttribute('data-theme',v);" +
  "else r.removeAttribute('data-theme')}s();window.addEventListener('storage',function(e){" +
  "if(e.key===k||e.key===null)s()})})()";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${arabic.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
