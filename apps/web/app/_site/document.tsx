import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Instrument_Sans } from "next/font/google";
import { copy, type Locale } from "./copy";
import { PATHS, SITE_URL, type PageKey } from "./site";
import "./site.css";

// The design system's type: Instrument Sans for Latin, IBM Plex Sans Arabic for Arabic,
// IBM Plex Mono for small labels and identifiers. Self-hosted by Next at build time.
const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"], display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic", subsets: ["arabic"], weight: ["400", "500", "600"], display: "swap",
});
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap",
});

export const siteViewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#f6f7f3" },
  ],
};

export function siteMetadata(locale: Locale, page: PageKey = "home"): Metadata {
  const t = copy[locale].meta[page];
  return {
    metadataBase: new URL(SITE_URL),
    title: t.title,
    description: t.description,
    alternates: {
      canonical: PATHS[page][locale],
      languages: { en: PATHS[page].en, ar: PATHS[page].ar, "x-default": PATHS[page].en },
    },
    openGraph: {
      type: "website", siteName: "ALYR", title: t.title, description: t.description,
      url: PATHS[page][locale], locale: locale === "ar" ? "ar_QA" : "en_US",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "ALYR" }],
    },
    twitter: { card: "summary_large_image", title: t.title, description: t.description },
  };
}

/** The whole document for a public page. Each language has its own root layout so the
 * `lang` and `dir` on `<html>` are right from the first byte. */
export function SiteDocument({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`${instrument.variable} ${plexArabic.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Marks that scripts run, before the first paint, so sections that animate in
            never flash. Without scripts the class is absent and everything is visible. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('al-js')" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
