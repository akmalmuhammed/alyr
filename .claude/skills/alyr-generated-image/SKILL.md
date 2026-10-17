---
name: alyr-generated-image
description: Make or change an image that code draws for ALYR. Use for the Sunday report card (apps/api/src/alyr/modules/agent/card.py, report_samples, the site's report images via scripts/site-report-images.mjs), the social and Open Graph cards (apps/web/app/_site/socialCard.tsx, opengraph-image.tsx), an Arabic social card, share images, a template's sample header image, a QR image, or any PNG, WebP, AVIF or SVG rendered on a server or at build time, including its label sizes at phone size and its truncation test. Load alyr-design first.
---

# An image drawn by code

A generated image travels on its own: a link preview in a WhatsApp chat, a report card in an
owner's chat, a header Meta reviews. Nobody sees the page around it, so it must say who it is
from and be true on its own, at the size a phone shows it.

## Before you start

1. Load `alyr-design` (tokens, Arabic, honesty).
2. Know the display size, not only the canvas size. A 1080 px card in a WhatsApp bubble is
   about 330 px wide: every size on the canvas is divided by about 3.3.
3. Read the existing renderers: `card.py` (resvg through `resvg-py`, fonts embedded,
   Arabic in RTL embeddings, mirrored layout, `fit()` with fontTools measuring),
   `socialCard.tsx` (`next/og`, English only, and why).
4. Pick the renderer by language:

| Content | Renderer |
|---|---|
| Any Arabic | **resvg** (as `card.py`): rustybuzz shapes Arabic correctly. Wrap each Arabic line in U+202B … U+202C, each number range in a left-to-right embedding, and mirror the layout (x → width − x). **Never `next/og`**: it joins letters but orders words left to right and spaces them unevenly. Never Pillow with raqm (needs system FriBiDi the API image lacks) |
| English only, at build time on the site | `next/og` is acceptable (`socialCard.tsx`), with the brand's TTFs from `_site/fonts/` |

## Rules

- **Sizes at display size.** The report card's smallest text is 31 px on the 1080 canvas
  (`card.SMALL`), about 9.5 px in the bubble: that is the floor for any label in a chat image.
  Social cards (1200 × 630) are shown at about 300 to 400 px: no text under 22 px on the
  canvas (its mono eyebrow today), the headline from 56 px.
- **Fonts embedded,** never system fonts (`skip_system_fonts` in resvg): Instrument Sans,
  IBM Plex Sans Arabic, IBM Plex Mono, each with its SIL OFL file beside it, copied from the
  design-system branch and named in `docs/brand.md`.
- **Colours from the tokens** (the generated Python module for the API, the generated TS
  module for the site), never literals in the renderer. Two themes: **Carbon** (the default
  in chats: it stands out in light and dark chats alike) and **Paper**. Volt only for the
  one signal (the busiest day, the logo's plane). No red or green; ▲▼ in ink.
- **The logo** from the mark's polygons, never retyped. Reversed on Carbon.
- **Mirrored in Arabic,** except the logo and ▲▼. Time runs right to left; Sunday is the
  rightmost bar. Arabic labels are never tracked or in capitals; English mono labels are.
- **Honest on its own.** A sample carries its sample mark on the image itself
  (the card's "SAMPLE"), in the image's language. No price
  unless the offer switch is on (the social card once printed "From QAR 449" with prices
  off). A percentage only when both weeks count 20 or more. No "paid through ALYR links".
- **One idea:** the shop and the week, one hero number with its change, seven bars with the
  week before as a ghost, two or three facts. A social card is the page's eyebrow, headline
  and up to three facts in its own words from `copy.ts`. Never a screenshot crammed small.
- **Ratios:** the report card is 1080 × 566 (WhatsApp's 1.91:1 header, not cropped by
  phones); social cards 1200 × 630; posts and slides follow `alyr-deck-and-social`.
- **Fit, never cut.** Measure each line with the font's advance widths; Arabic measured as
  joined text (isolated forms over-measure by 0.66 to 0.84: scale by 0.86, checked against
  resvg's own render). A long name shrinks to the minimum, then the layout changes; it never
  ends in "…" on a shipped image.
- **Words** in the same templates as the message or page it belongs to, so the image, the
  text and the dashboard never disagree.
- **Size budget** on the site: AVIF, WebP and a palette PNG fallback, explicit width and
  height, lazy below the first screen (`scripts/site-report-images.mjs`: 12 to 29 KB each).
  On WhatsApp the image is uploaded through Meta's Media API at send time, never hosted in
  public.

## Tests a renderer must have

Copy the pattern in `apps/api/tests/test_report_card.py`:
- renders for every sample, both languages, both themes, at the exact size;
- **no text below the minimum size** on any sample;
- **no line cut with an ellipsis** on any sample, in either language or theme;
- no AI words in any text;
- the Arabic layout is mirrored;
- the committed samples match what the renderer draws today.

Then look: render every sample at its display width (330 px for a chat image) and read it on
screen in both languages. Zoom into Arabic numbers and ranges («4–10 أكتوبر», «13,400 ر.ق»).

## When it changes

- Regenerate the samples (`python -m alyr.report_samples`, then
  `node scripts/site-report-images.mjs` for the site) and commit them with the change.
- A template's sample header image changed: the template needs resubmitting (the founder's
  step, `alyr-whatsapp-message`).
- A social card's words changed: check every card route still builds
  (`bash scripts/build-site.sh` fails if one is missing).
- A new image type imported by the web app needs a committed `.d.ts`
  (`_site/report/images.d.ts`), because CI type-checks without `next-env.d.ts`.

## Don't

- Draw Arabic with `next/og`, or ship an Arabic image you have not read at display size.
- Use a font from the system, a CDN or Google at render time.
- Put text in an image that should be in the message (screen readers and search cannot read it);
  every image has alt text from the copy file, built from its own facts.

## Done when

- [ ] Rendered at canvas size and read at display size, both languages, both themes.
- [ ] Minimum-size and no-ellipsis tests pass; samples regenerated and committed.
- [ ] Colours and fonts from tokens and embedded files; logo from the mark.
- [ ] Claims checked: sample marked, no price with the offer off, percentages by the rule.
