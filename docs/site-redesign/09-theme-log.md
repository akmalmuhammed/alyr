# Theme switch and dark `/chat`: build log

ALY-56, branch `aly-56-theme-switch`, from `origin/main` at `2b7c062` (17 Oct 2026). The founder asked for a light/dark switch on the public site and a real dark mode for `/chat` after the 2026 homepage went live.

## Plan

1. Structure: dark tokens under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and again under `:root[data-theme="dark"]`; light forced by `[data-theme="light"]`; components read tokens only; `color-scheme` set; one theme-color pair for every page.
2. Switch: an inline script in `<head>` applies the stored choice before the first paint and handles the click, so the switch works before the framework's scripts arrive (they start after the first paint). 44 px icon button beside the language link; a row in the menu on phones.
3. Transition: a same-document View Transition, the new theme sweeping in along 45° from the switch's corner (top inline-end), 480 ms on `--dur-3` and `--ease`. Instant without View Transitions or with reduced motion.
4. Dark `/chat`: the Carbon blocks on `--band`, the surfaces inside them lifted a step, the chat drawing in WhatsApp's own dark colours.
5. Docs: `docs/brand.md`.

## Log

- 17 Oct: read status, operating model, lane brief, ALY-56, brand.md, 04 §9, 08, the capture script and PR #46's diff. PR #46 changes three `site.css` lines (the statement's unlit words, `.product h3`, `.fx-step-t`); this branch leaves those lines alone.
- Committed in four stages: structure (`73c77d1`), switch (`c8fc84e`), sweep (`e8e7804`), dark `/chat` (`5e41bda`).
- Found on the way:
  - This laptop's Windows is in dark mode, so a headless capture without `--scheme=light` is dark. Always pass the scheme.
  - Editing the `content` of Next's theme-color tags made React add a third copy on hydration (it matches them by content). The script now leaves them alone and adds its own tag, without a media query, first in `<head>`, only while a choice is stored.
  - The page-navigation wipe's `animation: none` on the old root and its own animation on the new one also replace the UA's plus-lighter blend animation, so the sweep shows no blending artefacts; frames checked.
- Preview: `ALYR_DIST_DIR=.next-preview pnpm exec next dev -p 3107` (3101 is another session's).
- After the four stages: the light `--wa-soft-out` darkened a shade (WhatsApp's own grey is 4.2:1 on its sent bubble); the header's gaps close up between 53 and 62 rem, because with prices on, the English nav wrapped at 849 px once the switch took its 44 px.

## Checks (17 Oct)

- **Nothing else changed.** Computed colours of every element (and its `::before`/`::after`), old published build against this branch: light `/` and `/ar/chat` identical apart from a transparent inset line where the band and the closing call now draw their dark edge; dark `/` and `/ar` identical apart from the skip link (now inverts) and that edge (a box-shadow instead of a border).
- **No flash.** Built site, stored dark on a light device: `data-theme="dark"` is set 15–56 ms into parsing, before `<body>` exists, on all four pages. Captures at load (`--wait=0`) are dark.
- **Toggle.** Built site: the press changes `data-theme`, the stored value and theme-color (the script's own tag, first in `<head>`); the choice holds from `/` to `/chat` to `/ar` and `/ar/chat`, and back. It works with every `/_next/` script blocked. Enter and Space work; the focus ring shows in light, dark and over the Carbon header. With nothing stored, a change of the device's setting is followed live. Reduced motion: no sweep, no transitions. No JavaScript: no switch, the page follows the device.
- **Sweep.** Mid-transition frames in English (from the top right) and Arabic (from the top left); during it only the switch's glyph transitions, the header and links are already final at 60 ms.
- **axe-core 4.14**, `/`, `/ar`, `/chat`, `/ar/chat`, 1440 and 390, light and dark, at load and with every section read: the homepage has no serious or critical issue. `/chat` has the two PR #46 fixes (the statement's unlit words; the step buttons' names at 390), in both themes; with PR #46 merged in (trial merge, not committed) both pages have none. PR #46 merges cleanly with this branch.
- **Contrast in the drawn chats** (axe skips text under a filter): every text in the demo's six tabs and the flow's stories, every step, at least 4.5:1 in both themes.
- **Light-only leftovers on dark `/chat`:** none. The only light paint left is the logo, icons, WhatsApp's ticks and mic, the Volt glow and the off-screen skip link; no images.
- **Prices on** (`NEXT_PUBLIC_ALYR_OFFER=on`, built, not committed): the price section and the agreement in dark, both languages, 1440 and 390; the header on one line at 849, 900, 992 and 1024 px.
- **Lighthouse mobile** on `/` (built site, brotli, three runs): Performance 99, Accessibility, Best practices and SEO 100, LCP 2.3 s, CLS 0, TBT 10–40 ms. The inline script is 1.6 KB.
- Screenshots: `shots-theme/` (not committed): `a-` system light, `b-` system dark, `c-` stored dark on a light device (with `-at-load`), `d-` stored light on a dark device; four pages at 1440 and 390; full dark `/chat` pages; `extra/` for the sweep, the menu row, focus, the header at 849 and the price section.
