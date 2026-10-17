import { copy, type Locale } from "./copy";

/** The sun and the moon, on the 24 px icon grid in the icon set's line (brand.tsx): 1.7 px,
 * square ends, mitred corners. The moon's bite comes in along 45°, from the top end. */
function Glyph() {
  return (
    <svg
      className="ts-glyph"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <g className="ts-g ts-moon">
        <path d="M11.62 4.01A8 8 0 1 0 19.99 12.38 6 6 0 0 1 11.62 4.01Z" />
      </g>
      <g className="ts-g ts-sun">
        <path d="M12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Z" />
        <path d="M12 3.25V5.5M12 18.5v2.25M3.25 12H5.5M18.5 12h2.25M5.81 5.81l1.6 1.6M16.6 16.6l1.6 1.6M5.81 18.19l1.6-1.6M16.6 7.4l1.6-1.6" />
      </g>
    </svg>
  );
}

/**
 * The light/dark switch. Plain HTML: the script in <head> (document.tsx) handles the press,
 * remembers the choice and changes the theme, so the switch works as soon as the page is
 * drawn. Which label and glyph show is decided by the theme tokens in site.css, so the
 * markup never changes. Both labels say what pressing it does.
 *
 * `bar`: a 44 px icon button beside the language link, on wide screens.
 * `menu`: a row in the phone's menu, under the language link, with the short label shown.
 */
export function ThemeSwitch({ locale, place }: { locale: Locale; place: "bar" | "menu" }) {
  const t = copy[locale].theme;
  if (place === "bar") {
    return (
      <button type="button" className="ts ts-bar" data-theme-switch>
        <Glyph />
        <span className="sr-only ts-to-dark">{t.toDark}</span>
        <span className="sr-only ts-to-light">{t.toLight}</span>
      </button>
    );
  }
  return (
    <button type="button" className="ts ts-row" data-theme-switch>
      <Glyph />
      <span className="ts-to-dark">
        <span className="sr-only">{t.toDark}</span>
        <span aria-hidden="true">{t.dark}</span>
      </span>
      <span className="ts-to-light">
        <span className="sr-only">{t.toLight}</span>
        <span aria-hidden="true">{t.light}</span>
      </span>
    </button>
  );
}
