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
  // the businesses on the homepage's tabs, and what a chat's preview carries
  bakery: ["M4 20v-8a8 6 0 0 1 16 0v8z", "m9 9 1.5 2.5", "m13 8.5 1.5 2.5"],
  crate: ["M3 9h18v11H3z", "M5 9l2-5h10l2 5", "M10 13h4"],
  hanger: ["M10 6.5a2 2 0 1 1 2 2V10", "M12 10 3 17v2h18v-2z"],
  cup: ["M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z", "M16 10h1.5a2.5 2.5 0 0 1 0 5H16", "M9 3v2", "M12 3v2"],
  scissors: ["M8.5 6.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z", "M8.5 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z", "M8 8l12 10", "M8 16 20 6"],
  wrench: ["M15.5 3.5a5 5 0 0 0-5.4 6.6L3.5 16.7l3.8 3.8 6.6-6.6a5 5 0 0 0 6.6-5.4l-3 3-3.4-.6-.6-3.4z"],
  mic: ["M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z", "M6 11.5a6 6 0 0 0 12 0", "M12 17.5V21"],
  camera: ["M4 8h3l1.5-2h7L17 8h3v11H4z", "M15.2 13a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0z"],
  // the sales demo (ALY-263): its controls and the places a bakery keeps its work today
  close: ["M6 6l12 12", "M18 6 6 18"],
  notes: ["M5 4h14v16H5z", "M8 8h8", "M8 12h8", "M8 16h5"],
  sun: ["M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 2v2", "M12 20v2", "M2 12h2", "M20 12h2", "m4.9 4.9 1.4 1.4", "m17.7 17.7 1.4 1.4", "m4.9 19.1 1.4-1.4", "m17.7 6.3 1.4-1.4"],
  moon: ["M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"],
  pin: ["M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z", "M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  star: ["m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"],
  phone: ["M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"],
  directions: ["m12 2 10 10-10 10L2 12z", "M9 14v-3h5", "m12 8.5 2.5 2.5-2.5 2.5"],
  qr: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h2v2h-2z", "M18 14h2", "M14 18h2v2", "M18 18h2v2h-2z"],
  notebook: ["M6 3h13v18H6z", "M3 7h5", "M3 12h5", "M3 17h5", "M11 8h5", "M11 12h5"],
  sheet: ["M3 4h18v16H3z", "M3 9h18", "M3 14h18", "M9 4v16", "M15 4v16"],
  calculator: ["M5 3h14v18H5z", "M8 6h8v4H8z", "M8 14h1", "M12 14h1", "M15.5 14h.5", "M8 17.5h1", "M12 17.5h1", "M15.5 17.5h.5"],
  delivery: ["M3 6h11v10H3z", "M14 10h4l3 3v3h-7z", "M7.5 18.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z", "M18.5 18.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"],
  receipt: ["M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z", "M9 8h6", "M9 12h6", "M9 16h3"],
  bank: ["M3 9 12 4l9 5", "M5 9v9", "M10 9v9", "M14 9v9", "M19 9v9", "M3 20h18"],
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
