import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Instrument_Sans } from "next/font/google";
import { copy, type Locale } from "./copy";
import { OFFER_LIVE, PATHS, SITE_URL, type PageKey } from "./site";
import "./site.css";

// The design system's type: Instrument Sans for Latin, IBM Plex Sans Arabic for Arabic,
// IBM Plex Mono for small labels and identifiers. Self-hosted by Next at build time.
// Instrument Sans carries its width axis, so display type can settle from slightly
// condensed to normal width as it arrives (homepage motion, Latin only).
const instrument = Instrument_Sans({
  variable: "--font-instrument", subsets: ["latin"], axes: ["wdth"], display: "swap",
});
// Two weights: every preloaded file counts against the first paint, and Arabic set at 500
// falls back to 400, which reads almost the same at these sizes. The Latin subset is
// preloaded too: digits and "ALYR" inside Arabic text use it, and a font that arrives after
// the first layout makes the whole page lay out again (three times, one per late file).
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic", subsets: ["arabic", "latin"], weight: ["400", "600"], display: "swap",
});
// Mono sets the small labels, at 500 only: the body's 430 resolves to 500, so a 400 file was
// never used. Preloaded for the same reason as the Latin Arabic subset. (Preloads cannot be
// set per language here: this build shares font preloads across root layouts, so the
// Arabic files are preloaded on English pages too.)
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono", subsets: ["latin"], weight: ["500"], display: "swap",
});

/** Where the visitor's choice of theme is kept (localStorage), and the colour the browser
 * puts around the page in each theme: the page's own canvas. */
const THEME_KEY = "alyr-theme";
const THEME_COLOR = { light: "#f6f7f3", dark: "#0e1012" } as const;

/** Every public page follows the device into dark mode until the visitor chooses; the
 * script below keeps theme-color with the theme they choose. */
export const siteViewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

export function siteMetadata(locale: Locale, page: PageKey = "home"): Metadata {
  const t = copy[locale].meta[page];
  const description = OFFER_LIVE ? t.description : (t.descriptionNoOffer ?? t.description);
  return {
    metadataBase: new URL(SITE_URL),
    title: t.title,
    description,
    alternates: {
      canonical: PATHS[page][locale],
      languages: { en: PATHS[page].en, ar: PATHS[page].ar, "x-default": PATHS[page].en },
    },
    openGraph: {
      type: "website", siteName: "ALYR", title: t.title, description,
      url: PATHS[page][locale], locale: locale === "ar" ? "ar_QA" : "en_US",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "ALYR" }],
    },
    twitter: { card: "summary_large_image", title: t.title, description },
  };
}

// Runs in <head> before the first paint.
// `al-js`: scripts run, so sections that animate in never flash (the ALYR Chat page).
// `motion`: the homepage's start states apply. Only when the visitor has not asked for
// reduced motion, and only for 4 s unless the page hydrates and keeps it: if the code never
// loads, the class goes and every section simply shows. (4 s, not 2.5: the published pages
// start their scripts after the first paint, scripts/site-defer-scripts.mjs.)
const BEFORE_PAINT =
  "(function(){var d=document.documentElement;d.classList.add('al-js');try{" +
  "if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('motion');" +
  "window.__alyrMotion=setTimeout(function(){d.classList.remove('motion')},4000)}}catch(e){}})()";

/**
 * The theme, also before the first paint, so a stored dark choice never flashes light. This
 * function is not run on the server: its source goes into the page as it is (so it may use
 * nothing from outside itself), and it runs in the browser.
 *
 * - With no choice stored, nothing is set and the CSS follows the device, live.
 * - A stored choice ("light" or "dark") goes on <html> as `data-theme`, and theme-color
 *   follows it.
 * - It answers the switch (ThemeSwitch.tsx) itself, so the switch works before the page's
 *   other scripts start. Other open tabs follow.
 * - localStorage can be missing or refuse (private windows): then the choice lasts for the
 *   page only.
 */
function theme(key: string, colors: { light: string; dark: string }) {
  const root = document.documentElement;
  const device = window.matchMedia("(prefers-color-scheme: dark)");
  const stored = () => {
    try {
      const value = localStorage.getItem(key);
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  };
  // The browser's own colour around the page. The two theme-color tags from the viewport
  // above follow the device; a choice adds one of its own, without a media query, first in
  // <head>, which browsers then use (the first that matches wins). The page's own tags are
  // never edited: React checks them when the page hydrates and would add copies.
  const chrome = (value: "light" | "dark" | null) => {
    let meta = document.head.querySelector<HTMLMetaElement>("meta[data-alyr-theme]");
    if (!value) return meta?.remove();
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.setAttribute("data-alyr-theme", "");
    }
    meta.content = colors[value];
    if (document.head.firstElementChild !== meta) document.head.prepend(meta);
  };
  const set = (value: "light" | "dark" | null) => {
    if (value) root.setAttribute("data-theme", value);
    else root.removeAttribute("data-theme");
    chrome(value);
  };
  set(stored());
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) set(stored());
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("[data-theme-switch]")) return;
    const now = root.getAttribute("data-theme") ?? (device.matches ? "dark" : "light");
    const next = now === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(key, next);
    } catch {
      // not remembered; it still changes for this page
    }
    set(next);
  });
}

const THEME = `(${theme.toString()})(${JSON.stringify(THEME_KEY)},${JSON.stringify(THEME_COLOR)})`;

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
        <script dangerouslySetInnerHTML={{ __html: `${THEME};${BEFORE_PAINT}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
