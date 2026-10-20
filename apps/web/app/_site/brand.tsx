import { color } from "../_tokens/tokens";

// The R in the wordmark was redrawn on 12 Oct 2026 at the founder's request (full stem,
// chamfered bowl with a tighter counter). It differs from the design system's master
// files until those are regenerated; see docs/brand.md.
// The ALYR logo and icons, drawn from the master artwork in the design system
// (02_Logo_System/01_Master_SVG, 03_Icon_System/UI_Icons_SVG). The geometry is copied
// point for point. Never redraw, retype, stretch or recolor it: the only variants are
// Carbon on light and white on Carbon, each with the Volt plane.

const VOLT = color.brand.volt;

function FoldPlanes() {
  return (
    <>
      <polygon fill="currentColor" points="50,0 180,0 130,62 0,62" />
      <polygon fill="currentColor" points="0,72 126,72 39,160" />
      <polygon fill={VOLT} points="134,72 190,72 142,160 46,160" />
    </>
  );
}

/** Primary horizontal logo. Keep it at least 140px wide; below that use `Symbol`. */
export function Logo({ label, className }: { label: string; className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="20 30 986 160"
      role="img"
      aria-label={label}
      shapeRendering="geometricPrecision"
    >
      <g transform="translate(20 30)">
        <FoldPlanes />
      </g>
      <g transform="translate(300 35)" fill="currentColor">
        <polygon points="0,150 69,10 92,10 28,150" />
        <polygon points="76,37 92,10 164,150 134,150" />
        <polygon points="190,10 216,10 216,124 326,124 326,150 190,150" />
        <polygon points="348,10 379,10 433,80 414,107" />
        <polygon points="478,10 511,10 421,150 389,150" />
        <path fillRule="evenodd" d="M540 10H672L702 40V84L672 114H569V150H540ZM569 36V88H661L674 75V49L661 36Z" />
        <polygon points="620,88 655,88 706,150 671,150" />
      </g>
    </svg>
  );
}

/** The Command Fold symbol on its own. Decorative unless given a label. */
export function Symbol({ label, className }: { label?: string; className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 190 160"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      shapeRendering="geometricPrecision"
    >
      <FoldPlanes />
    </svg>
  );
}

const ICONS = {
  "arrow-right": ["M5 12h14", "m14 7 5 5-5 5"],
  "arrow-up-right": ["M7 17 17 7", "M9 7h8v8"],
  check: ["m5 12 4 4L19 6"],
  security: ["M12 3 4 6v5c0 5.2 3.4 8.4 8 10 4.6-1.6 8-4.8 8-10V6z", "m8.5 12 2.2 2.2 4.8-5"],
  users: [
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "M3 21v-2a6 6 0 0 1 12 0v2",
    "M16 4.5a3.5 3.5 0 0 1 0 6.5",
    "M17 15a5 5 0 0 1 4 4.9V21",
  ],
  data: ["M4 19V9", "M10 19V4", "M16 19v-7", "M22 19H2"],
  document: ["M6 3h8l4 4v14H6z", "M14 3v5h5", "M9 13h6", "M9 17h5"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  calendar: ["M5 4h14v16H5z", "M8 2v4", "M16 2v4", "M5 9h14"],
  workflow: ["M5 5h5v5H5z", "M14 14h5v5h-5z", "M10 7.5h4a3 3 0 0 1 3 3V14", "M7.5 10v4a3 3 0 0 0 3 3H14"],
  cloud: ["M7 18h10a4 4 0 0 0 .7-7.9A6 6 0 0 0 6.2 9 4.5 4.5 0 0 0 7 18Z"],
  dashboard: ["M4 4h6v6H4z", "M14 4h6v10h-6z", "M4 14h6v6H4z", "M14 18h6v2h-6z"],
  ai: ["M8 18h8", "M9 21h6", "M7 14a7 7 0 1 1 10 0c-1.4 1.2-2 2.2-2 4H9c0-1.8-.6-2.8-2-4Z"],
  settings: ["M7 7h10v10H7z", "M9 3v4", "M15 3v4", "M9 17v4", "M15 17v4", "M3 9h4", "M17 9h4", "M3 15h4", "M17 15h4", "M10 12h4"],
  // A drawn speech bubble for "message us": deliberately not WhatsApp's mark.
  chat: ["M4 5h16v11H9l-5 4z"],
  mail: ["M3 5h18v14H3z", "m3 6 9 7 9-7"],
  // a photo slot with no photo yet, as the order page draws it
  image: ["M4 5h16v14H4z", "m4 16 5-5 4 4 2-2 5 5", "M15 9h1"],
  download: ["M12 4v11", "m7 10 5 5 5-5", "M5 20h14"],
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  "chevron-down": ["m6 9 6 6 6-6"],
} as const;

export type IconName = keyof typeof ICONS;

/** A 24px-grid ALYR interface icon. Always decorative: pair it with a text label. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
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
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
