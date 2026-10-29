# Rulings (creative director), 25 Oct 2026

For the fix pass on branch `aly-232-sector-pages`. Apply 06 and 07 with these rulings; where a
ruling differs from a critique, this file wins; `00-founder-decisions.md` beats everything.

## Copy, claims and Arabic (07)

- **Apply as written:** P0-1 (no promise to a named day: Ahmed's row becomes a credit sale
  recorded with the new balance sent); P1-1 to P1-6; P2-3 to P2-14; P2-16 to P2-18; P2-21 to
  P2-29.
- **P2-1, changed:** the figure's title becomes "The same hour, today and with ALYR"
  («الساعة نفسها، اليوم ومع ALYR») on the sector pages. The homepage's own slider label
  ("The same afternoon…", `home.business.split.label`) stays: it belongs to the homepage.
- **P2-2 with design P1-2, one answer:** "Today’s chats as they pile up, and the same
  customers as ALYR keeps them. Move the fold, or press Today or With ALYR." No side words; it
  names the buttons as they read, which exist at every width.
- **P2-15, applied:** each repeated answer reworded. The restaurants answer keeps "ALYR takes
  no cut of those orders", as the homepage says it with the offer off [F].
- **P2-19, changed:** "comes to show you how it would work for your bakery, on your own phone"
  (and the like for each trade), so no page promises the shop's own menu loaded before a sale.
- **P2-20, changed:** the cards' `alt` stays static (per-page `alt` needs
  `generateImageMetadata`, which moves the card's address and the build's glob); it is
  reworded to say what the card shows: "ALYR: a page for one kind of owner-run business in
  Qatar" and "ALYR: an owner guide by the ALYR team". The eyebrow drops the doubled "ALYR".
  Arabic cards stay the homepage's English card, as every Arabic page today.
- **Not for this pass:** the Meta template condition on reminders and entry notices (a
  site-wide question, `/bookings` and `/accounts` say the same; for the founder). «دين» in the
  credit guide and «رفيع»: for the native reviewer (ALY-66).

## Design (06)

- **P1-1, applied:** the figure moves directly under the opening; the opening sits on the
  grid, H1 on the start seven columns, the answer on the end five at the H1's last line, the
  action row under both. The figure's section opens as a plate (its title over the drawing,
  no split lead) so it does not repeat the opening's shape.
- **P1-2:** see the copy ruling above.
- **P1-3, changed:** the buttons stay in the drawing (the homepage's component, accepted); the
  drawing gets the room for them on phones: `.split { --sh }` below 53rem goes from 23rem to
  24.5rem, so five rows end above the buttons. This also fixes the homepage's phone figure.
- **P1-4, changed:** keep the faded side's dimming (it is what makes it "faded") and lift the
  ALYR side one step: `.split-after { background: var(--dark-surface); }`. In light this is a
  step from Carbon, in dark it is the panel over the band. Shared with the homepage, on
  purpose; measure both.
- **P1-5, not for this pass:** a Groceries tab on the homepage is a homepage change for the
  founder (open list). The breadcrumb's "By business" still lands where every other trade is.
- **P1-6, applied:** token for token where a token exists (`--h3`, `--fs-body`, the leading and
  tracking tokens, `--rule-hairline`, `--rule-strong`). Where no token exists the size stays
  and is listed.
- **P2-1, applied:** the guide moves into the Questions section's start column
  (`QuestionsBlock` gains an optional `aside`, additive; product pages unchanged); `#guide`
  goes.
- **P2-2, applied:** end columns from column 5, as `.faq-list`.
- **P2-3, applied with a check:** the H1 takes the display-sm scale; if the action row leaves
  the first screen at 1440 × 900 in either language, it goes back to `--h2`.
- **P2-4, P2-5 (sector and guide pages only; the homepage's tags are not touched), P2-7, P2-8,
  P2-9: applied.**
- **P2-6, not for this pass:** the fold's rest point is the homepage's tuned value.
- **P2-10:** "free time(s)" becomes "open time(s)" on the new pages.
- **Footer, applied:** the row shows its name as a label, short trade names (`short` per
  sector), the current page underlined as the products row does it, Guides beside Questions.
- **Homepage link, applied:** inside `.biz-foot`, before the outlined button; Arabic with a
  verb («اطّلع على صفحة المخابز»).

## Checks for the fix pass

`tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm site:check`; `pnpm site:a11y` on the new pages
and `/`; Lighthouse on `/for/bakeries`, `/guides/stop-losing-whatsapp-orders` and `/`; 320
probes on every new page in both languages; the figure at 390 in both themes; the homepage's
business panel at 1440 and 390, both languages; screenshots of every new page.
