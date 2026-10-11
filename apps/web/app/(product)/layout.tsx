import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import "../globals.css";

const sans = IBM_Plex_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const arabic = IBM_Plex_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

// Product screens are for signed-in staff and for customers arriving by a private link.
// None of them belongs in a search engine.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_ALYR_SITE_URL ?? "https://alyr.online"),
  title: "ALYR workspace",
  description: "The ALYR workspace for bookings, orders, payments and the team inbox.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${arabic.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
