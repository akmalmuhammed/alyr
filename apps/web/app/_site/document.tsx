import type { Metadata, Viewport } from "next";
import { SiteAnalytics } from "../_analytics/SiteAnalytics";
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Instrument_Sans } from "next/font/google";
import { copy, type Locale } from "./copy";
import { OFFER_LIVE, PATHS, PLAIN, SITE_URL, SITE_VERIFICATION, type PageKey } from "./site";
import { dark, semantic } from "../_tokens/tokens";
import "../_tokens/tokens.css";
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
const THEME_COLOR = { light: semantic.canvas, dark: dark.semantic.canvas } as const;

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
      // Each English product page has its own card (app/(site)/<page>/opengraph-image.tsx),
      // which Next names with a hash and fills in itself when no image is given here. The
      // homepage and the Arabic pages share the homepage's English card at /opengraph-image
      // (app/opengraph-image/route.tsx; socialCard.tsx says why it is in English).
      ...(locale === "en" && page !== "home" && !(PLAIN as readonly string[]).includes(page) ? {} : { images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "ALYR" }] }),
    },
    twitter: { card: "summary_large_image", title: t.title, description },
    // Search Console and Bing Webmaster Tools, when verified by tag (D-056).
    ...(SITE_VERIFICATION.google || SITE_VERIFICATION.bing
      ? {
          verification: {
            ...(SITE_VERIFICATION.google ? { google: SITE_VERIFICATION.google } : {}),
            ...(SITE_VERIFICATION.bing ? { other: { "msvalidate.01": SITE_VERIFICATION.bing } } : {}),
          },
        }
      : {}),
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
 *   other scripts start. The new theme sweeps in with a View Transition (site.css); without
 *   one, or with reduced motion, it simply changes. Other open tabs follow.
 * - localStorage can be missing or refuse (private windows): then the choice lasts for the
 *   page only.
 */
function theme(key: string, colors: { light: string; dark: string }) {
  const root = document.documentElement;
  const device = window.matchMedia("(prefers-color-scheme: dark)");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
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

  let turn = 0;
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
    // The new colours apply at once, with every transition off, so nothing fades through
    // the old theme; the switch's glyph keeps its turn (site.css).
    const swap = () => {
      root.setAttribute("data-theme-snap", "");
      set(next);
      void getComputedStyle(document.body).backgroundColor;
      requestAnimationFrame(() => root.removeAttribute("data-theme-snap"));
    };
    const doc = document as Document & {
      startViewTransition?: (update: () => void) => { finished: Promise<void> };
    };
    if (!doc.startViewTransition || still.matches) return swap();
    const mine = ++turn;
    root.setAttribute("data-theme-sweep", "");
    doc.startViewTransition(swap).finished.finally(() => {
      if (mine === turn) root.removeAttribute("data-theme-sweep");
    });
  });
}

const THEME = `(${theme.toString()})(${JSON.stringify(THEME_KEY)},${JSON.stringify(THEME_COLOR)})`;

/**
 * The header's menus (the Products panel, the phone menu): native `<details>`, so they open
 * and close by keyboard and without JavaScript. This adds what `<details>` lacks, before the
 * page's other scripts arrive, as the theme switch does: Escape closes the open menu and
 * puts focus back on its button; a click outside, a link chosen inside, or focus moving
 * out of it closes it; and only one is open at a time. Like `theme`, its source goes into
 * the page as it is.
 */
function menus() {
  const all = () => Array.from(document.querySelectorAll<HTMLDetailsElement>("details[data-menu]"));
  const close = (menu: HTMLDetailsElement, focus: boolean) => {
    menu.open = false;
    if (focus) menu.querySelector("summary")?.focus();
  };
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = all().find((menu) => menu.open);
    if (open) close(open, open.contains(document.activeElement));
  });
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    for (const menu of all()) {
      if (!menu.open) continue;
      if (!target || !menu.contains(target)) close(menu, false);
      else if (target.closest("a")) close(menu, false);
    }
  });
  document.addEventListener("toggle", (event) => {
    const opened = event.target;
    if (!(opened instanceof HTMLDetailsElement) || !opened.open || !opened.hasAttribute("data-menu")) return;
    for (const menu of all()) if (menu !== opened && menu.open) menu.open = false;
  }, true);
  document.addEventListener("focusout", (event) => {
    const menu = event.target instanceof Element ? event.target.closest<HTMLDetailsElement>("details[data-menu]") : null;
    const next = event.relatedTarget;
    if (!menu || !menu.open || !(next instanceof Node) || menu.contains(next)) return;
    close(menu, false);
  });
}

const MENUS = `(${menus.toString()})()`;

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
        <script dangerouslySetInnerHTML={{ __html: `${THEME};${MENUS};${BEFORE_PAINT}` }} />
      </head>
      <body>{children}<SiteAnalytics /></body>
    </html>
  );
}
