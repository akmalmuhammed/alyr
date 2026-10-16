import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Instrument_Sans } from "next/font/google";
import { copy, type Locale } from "./copy";
import { PATHS, SITE_URL, type PageKey } from "./site";
import "./site.css";

// The design system's type: Instrument Sans for Latin, IBM Plex Sans Arabic for Arabic,
// IBM Plex Mono for small labels and identifiers. Self-hosted by Next at build time.
// Instrument Sans carries its width axis, so display type can settle from slightly
// condensed to normal width as it arrives (homepage motion, Latin only).
const instrument = Instrument_Sans({
  variable: "--font-instrument", subsets: ["latin"], axes: ["wdth"], display: "swap",
});
// Two weights: every preloaded file counts against the first paint, and Arabic set at 500
// falls back to 400, which reads almost the same at these sizes.
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic", subsets: ["arabic"], weight: ["400", "600"], display: "swap",
});
// Mono only sets small labels, so it is not preloaded: the first screen's large type is
// what must not wait. (Preloads cannot be set per language here: this build shares font
// preloads across root layouts, so the Arabic weights are preloaded on English pages too.)
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap", preload: false,
});

export const siteViewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#f6f7f3" },
  ],
};

/** The homepage follows the device into dark mode; the ALYR Chat page stays light. */
export const homeViewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1012" },
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

// Runs in <head> before the first paint.
// `al-js`: scripts run, so sections that animate in never flash (the ALYR Chat page).
// `motion`: the homepage's start states apply. Only when the visitor has not asked for
// reduced motion, and only for 2.5 s unless the motion code arrives and keeps it: if
// that code never loads, the class goes and every section simply shows.
const BEFORE_PAINT =
  "(function(){var d=document.documentElement;d.classList.add('al-js');try{" +
  "if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('motion');" +
  "window.__alyrMotion=setTimeout(function(){d.classList.remove('motion')},2500)}}catch(e){}})()";

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
        <script dangerouslySetInnerHTML={{ __html: BEFORE_PAINT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
