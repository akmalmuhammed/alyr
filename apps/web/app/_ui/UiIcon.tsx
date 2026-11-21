// The few glyphs the kit itself draws (a check in a box, a chevron on a select, the cross that
// clears a search). They follow the brand's geometry: a 24 grid, square ends and mitred
// corners, drawn at 16 px with a stroke that reads about 1.5 px. `icon` props on the kit's
// components take any node, so the shared icon set can replace this one without a change here.

import type { SVGProps } from "react";

const PATHS = {
  check: "M4.5 12.5 9.5 17.5 19.5 6.5",
  plus: "M12 4.5v15M4.5 12h15",
  minus: "M5 12h14",
  x: "M5.5 5.5l13 13M18.5 5.5l-13 13",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20",
  down: "M5.5 9 12 15.5 18.5 9",
  up: "M5.5 15 12 8.5 18.5 15",
  /** Points to the start of the line: left in English, right in Arabic. */
  start: "M15 5.5 8.5 12 15 18.5",
  /** Points to the end of the line: right in English, left in Arabic. */
  end: "M9 5.5 15.5 12 9 18.5",
  download: "M12 4v11M7 11l5 5 5-5M4.5 20h15",
  trash: "M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13",
  edit: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  info: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 11v5.5M12 7.5h.01",
  warn: "M12 4 3 20h18zM12 10v4M12 17h.01",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  copy: "M9 9h11v11H9zM5 15V4h11",
  send: "M4 12 20 4l-6 16-3-7z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01",
} as const;

export type UiIconName = keyof typeof PATHS;

/** Names whose direction means "toward the end of the line": they flip in Arabic. */
const FLIPS: ReadonlySet<string> = new Set(["start", "end", "send"]);

export function UiIcon({ name, className, ...rest }: { name: UiIconName; className?: string } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      className={["u-ico", FLIPS.has(name) ? "u-ico--flip" : "", className ?? ""].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
