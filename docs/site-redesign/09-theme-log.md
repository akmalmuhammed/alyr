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
