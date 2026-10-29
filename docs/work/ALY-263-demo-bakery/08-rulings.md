# ALY-263 · Rulings on the two critiques

For the fix pass on branch `aly-demo-bakery`. Apply `06-critique-design.md` and `07-critique-copy.md` with these rulings; where a ruling differs from a critique, this file wins; `00-founder-decisions.md` still beats everything. Creative director: the orchestrating session, 29 Oct 2026.

## Design (06)

- **Apply as written:** P0-1 (the cake builder: the next group scrolls into view after each tap, the filling as two columns, the item's description dropped in the builder, the phone takes its row); P0-2 (scene 2 top-aligned, the steppers step down on short screens); P1-1 (the wipe's legs to `100vw + 100vh`, a new token `--ease-fold` for an even sweep, `2 × --play-4`, the leaving scene settling, parts arriving behind the edge); P1-2 (the quote stays and closes along 45° under the after); P1-3 (scene 2 and 5 no longer jump; scene 3's condition line moves to the foot rule); P1-11 (scene 3: the daily limit becomes its own panel with the count at `--stage-figure`, one chip per figure, the clock hidden when the line already says the time); P1-13 (scene 7 fits; the mini card inside the phone loses its facts row; the Agent home is scaled to fit and keeps a visible scroll only as a fallback).
- **Changed:**
  - P1-4 (scene 1): the chats move into a drawn phone (WhatsApp's own colours, unread counts, a hard crop, no mask). Beat 0 shows the phone's lock screen at 11:47 with the count; beat 1 the list. Kept: Volt on the clock as scene 1's one signal (the moment the story starts), so nothing else in scene 1 is Volt (rejects the P2 on it).
  - P1-5 (scene 4 befores): each before gets a drawn phone with the customers' own messages for that pain, beside the quote. One generic figure (`beforeChat` words per pain), not a bespoke drawing each, to keep it to one pass.
  - P1-6: the recap cards stay, larger; every clock and "Noor 7" get no-break spaces.
  - P1-7: "Reminders sent" becomes a status line; price groups stay on the café beat (the founder's script puts them there) as a compact row without its own heading.
  - P1-8: each station gets a small drawn fragment above the wire (the line it changed), the lit one at full strength, the band filled. Not the homepage's tiles: they belong to the site's CSS.
  - P1-9: the after becomes a workspace window with a sidebar (the six products) and Mariam's record; Sample moves into the window's bar. The islands do not travel into the sidebar (one more beat of motion for little; rejected for this pass).
  - P1-10: the monthly row leaves (scene 8 has it); the second branch leaves the screen and goes to the notes; a Needs Akmal item asks whether to show it. The beat keeps a list of three rows.
  - P1-12: scene 6 shows two phones (the map, and the customer's chat with the request and her review); beat 3 the counter card and the bio link line.
  - P1-14: beat 0 the four steps on one rule with a 45° tick each; beat 1 the four questions alone.
- **P2, apply:** the untapped pain mark a solid square; the tapped card opaque; no-break spaces; "Paid" stamp delay `--play-4`; going back wipes from the bottom inline-start corner; scene 4's own progress bar removed; the Arabic monogram skips the trade word (مخبز, حلويات, مقهى); scene 9's days three by two; notes slimmer, no capitals heading; the focus ring clears the notch; no window shadow on drawings that sit on the grid; scene 2's stepper labels at `--stage-lead`.
- **P2, not applied:** dark `--phone-outline` (a shared token the site uses; changing it changes the site's phones; for the product and site lanes, noted in the build log).

## Copy, claims and Arabic (07)

- **Apply as written:** P0-1 (the customers' messages carry an order word, so the product's own reply is what follows); P0-2 ("in Thursday's orders"; the list panel labelled **Not built yet**, its note saying so; "The name, “Noor 7”, is in her chat beside the order"; the founder's note changed by one word); P1-2, P1-3, P1-4, P1-5, P1-6, P1-8, P1-9, P1-10 (the review note; who sends at go-live is Needs Akmal), P1-11, P1-12 (Mahbash Café, Ghaf House Offices; added to the names register).
- **Changed:** P1-1: the opening line becomes "Wednesday night, Eid week." / «ليلة الخميس، في أسبوع العيد.», and the morning beat offers "Today · Thu". It changes the founder's screen line, so it is on his list. P1-7: as design P1-10 above.
- **P2, apply:** 2 (Friday "Closed" in the sample, so only Thursday is full), 3, 4, 5, 6, 7, 8 (kept: "No app commission"), 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26 (Shaikha), 27, 28 (5:10 pm), 29, 30, 31 (the invoice's money in the page's language).
- **P2, not applied:** 1 (a dated Saturday would need a real Eid date; "Sat" as the order page prints a short day); 10 (the founder's line); 23 to 25 (for the native reviewer, ALY-66).
- **Product lane:** the first-person `wa_text.py` notify lines, the tracking page's «المتجر», «عاد» agreement, the report's "1 payment reminder for you" wording, and making "cake"/«كيكة» an order word: listed in the PR, not changed here.

## Checks for the fix pass

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `node scripts/design-check.mjs`; the keyboard walk with axe on every beat, English and Arabic light at 1440 × 900, English dark; 1280 × 800 and 1024 × 768 fit probes; the cake built by taps alone at 1280 × 800; a motion probe that the wipe's edge is on screen for most of its run; offline reload.
