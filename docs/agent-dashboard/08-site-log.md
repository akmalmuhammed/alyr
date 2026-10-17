# ALYR suite site: build log

ALY-99, branch `aly-99-suite-site` (worktree `D:\alyr-home`), cut from `origin/aly-agent-dashboard` (PR #50) with `origin/main` merged in. Spec: `07-site-brief.md`; words: `06-messaging.md`. Newest at the bottom.

## 17 Oct, start

- Read, in order: `docs/status.md`, `docs/operating-model.md`, `docs/lanes/site-and-brand.md`, ALY-99; then `07-site-brief.md`, `00-founder-decisions.md`, `06-messaging.md`, `01-research.md` D and E, `05-critique.md` ("As a homepage figure"), `02-data.md`; from the earlier redesign `04-brief.md` §9, `08-rulings.md`, `05-build-log.md`, `09-theme-log.md`.
- `06-messaging.md` and `07-site-brief.md` were not on the branch (untracked in `D:\alyr-agent`); copied in read-only and committed here, so the branch carries its own spec.
- Product truth read from the code, not only the docs: the router and chat handlers (`modules/router.py`, `orders/chat.py`, `bookings/chat.py`, `ledger/chat.py`), reminders (`bookings/service.py`, `ledger/service.py`, `routes/ledger.py`), the report (`modules/report.py` and each `report.py`), the Agent engine (`agent/view.py`, `insights.py`), the seeds (`seed_qirfa.py`, `seed_bookings.py`) and the workspace screens (`(product)/_workspace/Screens.tsx`). No product code changed.
- Preview on port 3111 (`ALYR_DIST_DIR=.next-preview`); 3101 belongs to another session's `D:\alyr whatsapp`. Captures with `C:\t\suite\snap.mjs` (outside the repo): many shots and axe runs in one headless Edge, profile `C:\t\suiteprof`.

## The hero's body: the verb check (07 §1)

Founder's draft: "It replies to the routine, sends the reminders, follows up what's owed and tells you what needs you, right in your WhatsApp."

| Verb | What the product does | Verdict |
|---|---|---|
| replies to the routine | `modules/router.py`: a message with an order word gets the order page link (`orders/chat.py`), a booking word the booking link, "my booking" the next booking with a Cancel button, a balance or pay word the balance or a pay link (`ledger/chat.py`); anything else gets the menu ("Welcome to {shop}. How can we help?" with buttons), or, with no module to answer, "Thanks for your message. We will reply shortly." Free questions are not answered: they wait in the inbox for a person, and the automatic replies pause once a person answers | True as written. Nothing implies it answers free questions |
| sends the reminders | Booking reminders: a job is queued at booking time for 2 hours before (`bookings/service.py` `_schedule_reminder`), skipped if cancelled or moved, and only if the business has reminders on. Payment reminders: sent only when someone presses Send reminders (`POST /api/ledger/reminders`, `ledger/service.py` `send_reminders`); there is no schedule | True ("the reminders" covers both; the next verb says how payment reminders go) |
| follows up what's owed | Payment reminders go only on a press; ALYR Agent flags what is overdue and not reminded (`insights.py`, rule "owed 30+ days, no promise, no reminder in 7 days") | Changed, as the brief says: "helps you follow up what's owed" / «ويساعدك في متابعة المستحقات» |
| tells you what needs you, right in your WhatsApp | "Needs you now" is on the workspace's home screen, not in WhatsApp. The owner's WhatsApp gets only the Sunday report (built, API only, never yet sent to an owner; the `weekly_report` template must be approved) | Not true as one phrase. The sentence is split so the place goes with the right verbs |

Shipped: "Right in your WhatsApp, it replies to the routine, sends the reminders and helps you follow up what's owed. On one screen, it tells you what needs you. We set it up in your shop. You run the business." Arabic: «داخل واتساب، يردّ على الرسائل المعتادة، ويرسل التذكيرات، ويساعدك في متابعة المستحقات. وعلى شاشة واحدة يخبرك بما يحتاجك. نجهّزه لك في محلك، وأنت تدير عملك.»

One tension left for the founder: the hero's "it" is the agent of the H1 and the eyebrow names ALYR Agent, but in the product the replies and reminders come from ALYR Chat and ALYR Bookings; ALYR Agent shows, flags and counts them ("Done for you"). The `/agent` page says this plainly in its questions (06's "Will it message my customers? No…" kept, with what does send messages named).

## Decisions taken while building

- **Clinics left out** (07 §1: only if 06's wording makes no health-data claim). 06's clinic row and `/bookings` question say "no patient files: ALYR keeps the appointment, not the medical record", which is a claim about health data. Clinics are out of "By business", `/bookings` "Who it's for" and its questions; "Salons and clinics" on `/agent` became "Salons and barbers", plus a "Home services" row from the AC company's sample.
- **No payment reminder in the feed.** The bakery and the AC company both show "owed 30+ days, not reminded in 7 days": a payment reminder in the same afternoon's feed would contradict the screen beside it. Their feed flags that card instead ("Flagged by rule", with the rule line), which is also the honest picture: payment reminders wait for a press.
- **The feed's events are the samples' own.** Each sample's feed (`copy.agent.samples.*.feed`) uses its own shop, service and customer names and the product's exact wording ("Welcome to Qirfa Bakery. How can we help?", the bookings greeting «كيف نقدر نخدمك؟» for the salon and the ledger's «كيف نقدر نساعدك؟» where credit accounts are on). A flag takes its words from the dashboard itself (a Needs row or a suggestion, by key), so the two cannot disagree. Each event names the "Done for you" rows it counts towards, and the count steps from (final − events) up to the fixture's figure: 179 → 183 messages and 6 → 7 booking reminders for the bakery. A flag adds nothing. A shop takes one booking at a time, so at most one booking reminder can fall in the feed's twenty minutes; the salon's and the AC company's feeds have one each.
- **The hero shows the bakery only; the switch is in the spotlight** (07 §2). The hero's window is cropped and taken out of the tab order (`inert`): it is a picture of the screen the next section shows whole, interactive, with the switch and numbered callouts. `/agent`'s hero has the switch, the full dashboard and the feed, which follows the selected sample and plays again on a switch.
- **The feed plays once, in under 5 s** (0.6 s, then one event every 0.88 s), so it needs no pause control (WCAG 2.2.2). Without JavaScript, or with reduced motion, it is composed. Its status dot lights once, with one ring.
- **Callout 6** ("The same week on WhatsApp, every Sunday at 9:00") is not on the spotlight figure: showcase mode hides the report line, so there is nothing for the mark to point at. The Sunday report is step 4 of How it works and its own section on `/agent`.
- **"Collected through payment links" is off the Credit accounts drawing** (07 §1: no "paid through ALYR links" on public samples). The `/accounts` demo keeps its Pay tab with the live caption "The payment page is still a test page: no money moves."
- **The sample report agrees with the dashboard.** The live FIG 07 said "Orders received: 64, worth QAR 2,310"; the bakery's dashboard beside it says QAR 8,520 for four and a half days. The report is rebuilt from the bakery fixture's last week (QAR 10,555 over 4 to 10 Oct) and gains the engine's Credit accounts section, first as the engine orders it, ending "Next step: send reminders from Credit accounts." (which is why the suggestion on 15 Oct says no reminder in 7 days).
- **Two [F] answers softened instead of promised.** "The bookings you already have, we enter for you" and "we record each customer's balance with you" became "we agree how the bookings you already have come across" and "we go through each customer's balance with you", which promise no work the founder has not agreed to.
- **The product bar has no call to action.** 01 D puts one there, but the header's Volt button sits right above it, and the brand allows one Volt button on screen at a time.
- **The social card still said "From QAR 449 a month" with prices off** (`opengraph-image.tsx` read `facts`, not `factsNoOffer`). Fixed with the new headline.

## Stage 1 to 6, first build

Built in one pass, because the copy, the figure and the page template are shared: `copy.ts` (types for the suite, the Agent figure, the three pages; all words in English and Arabic), the header's Products menu and phone group, footer products row, `AgentFigure.tsx` + `agentfig.css`, `ProductKit.tsx` + `kit.css`, `Sheets.tsx` (Bookings and Credit accounts screens), `PageDrawings.tsx`, `drawings.css` (split out of `home.css`), `samples.ts`, the homepage, `/agent`, `/bookings`, `/accounts`, `/chat` changes, routes, `PATHS`, `build-site.sh`. Committed in stages by group of files; intermediate commits do not all build on their own, the last one does.

## Stage 7 and the final review

Every section of every page looked at in both languages, at 1440 and 390, in light and dark, on the built site (`scripts/build-site.sh`, served with compression on port 3112). Whole-page captures in `shots-site/final/` (40 files, composed); the moments a whole page cannot show in `shots-site/extra/` (the Products menu open, each sample in the switch, the feed starting, mid-run and composed, reduced motion, no scripts, 320 px). Not committed.

Fixed in the first pass (stage 7): the bookings sheet's Cancel cut off, a double space in the order-bar crop, the credit sheet's legend spacing, "Coming" twice for Payroll, the `/chat` title and the suite heading breaking badly (named line breaks now), the product bar showing the page through it, the 320 px overflow on the English homepage, the showcase numbers' sideways scroller at 390 (axe), "Noor A." and "0–30" reversed in Arabic, the Arabic eyebrow set in capitals, the select chevron pointing the wrong way in Arabic.

Fixed in the final pass:
- **The dashboard on the site now matches the product exactly.** Compared element by element with `/agent-sample` (every `ag-` element's type and colours, light and dark, English and Arabic): the homepage's agreement drawing used the dashboard's own `ag-` class names, so `.ag-top` set the top items in mono capitals and `.ag-tick` could restyle a Done row's tick; it is `agr-` now. On `/agent` the page's `h3` rule made the dashboard's section labels 19 px; the page rules now stop at the dashboard (`:not(.ag h3)`). The site's 430 body weight no longer reaches it (400, as in the product). After the fix: no difference on the homepage hero, the spotlight or `/agent`, in either theme or language.
- **Arabic ruled rows**: the second and third cells of `/agent`'s how-it-works steps and of every product page's three facts lost their padding beside the rule (a `[dir="rtl"]` shorthand outranked `li + li`). Logical padding now. The same bug was on the live `/ar/chat` facts.
- **Payroll's empty dashed box** in the suite is gone: it read as a missing picture. The dashed rule and "Coming" say it.
- **How it works** on the homepage: the early-access note and its button sit at the top beside the Sunday report (they floated in the middle of a tall empty column).
- **By business**: the product tags wrap under each other, not under "Uses".
- **`/chat`, Who it's for**: every row's text starts on the same line (the tags' column was as wide as each row's tags); the link inside a row no longer starts indented when it wraps.
- **`/bookings`**: the filtered sheet ("Visits not marked yet") is as wide as the screen above it; at 46 rem it was clipped and its buttons wrapped into three lines. Callout 1 said "Today and the next seven days" for the third time in the section; it says "Every visit booked from the chat, in time order."
- **320 px**: the sample switch fits on one row (it scrolled sideways), and the hero figure is clipped sideways so the plate's 45° entrance never widens the page for its first second.
- **Copy**: the feed's "Order #1441 · Lina F. · with its tracking page" reads "Order #1441 from Lina F., with its tracking page"; the report caption lost "sample figures" (its fictional label already says sample); the product pages' "Works with" section has the eyebrow "The products" instead of repeating its title. Arabic to match.

## Checks (built site, 17 Oct, final build)

`pnpm lint` clean, `pnpm build` and `bash scripts/build-site.sh` pass (89 files, 3.4 MB). `npx tsc --noEmit` clean.

**axe-core** (scrolled through, composed), 10 pages × 1440 and 390 × light and dark = 40 runs: no violations at all, of any impact (so none serious or critical).

**Lighthouse**, mobile (simulated throttling, Edge headless), two runs each; the lower score, the slower LCP and the longer TBT of the two:

| Page | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| `/` | 98 | 100 | 100 | 100 | 2.4 s | 0 | 20 ms |
| `/ar` | 98 | 100 | 100 | 100 | 2.4 s | 0 | 50 ms |
| `/chat` | 99 | 100 | 100 | 100 | 2.3 s | 0 | 60 ms |
| `/ar/chat` | 99 | 100 | 100 | 100 | 2.3 s | 0 | 50 ms |
| `/bookings` | 99 | 100 | 100 | 100 | 2.3 s | 0 | 30 ms |
| `/ar/bookings` | 99 | 100 | 100 | 100 | 2.3 s | 0 | 50 ms |
| `/agent` | 99 | 100 | 100 | 100 | 2.3 s | 0 | 50 ms |
| `/ar/agent` | 99 | 100 | 100 | 100 | 2.3 s | 0 | 40 ms |
| `/accounts` | 99 | 100 | 100 | 100 | 2.3 s | 0 | 50 ms |
| `/ar/accounts` | 98 | 100 | 100 | 100 | 2.3 s | 0 | 70 ms |

The LCP element is the hero's body text (homepage) or the lead (product pages), all render delay: the text waits for the web fonts. JavaScript per page is about 140 to 143 KB gzipped, plus a 38 KB polyfill file only old browsers load; each page's HTML is 21 to 39 KB gzipped (the homepages are the largest, with three dashboards' data).

Also checked: no horizontal scroll at 320 px on the pages tried (`scrollWidth` 320); without scripts the full feed and every section show and the sample switch is hidden; with reduced motion the feed is composed; the Products menu opens by keyboard, closes on Escape (focus back on its button), on a click outside, on a link and when focus leaves, one menu open at a time.

With the offer switch on (`NEXT_PUBLIC_ALYR_OFFER=on`, a second dev server): the price section, "from QAR 449" with the combinations (QAR 599, QAR 749, ALYR Agent included), the money-back agreement and the Price link, in English and Arabic, light and dark, 1440 and 390 (`shots-site/offer/`).

Found and not fixed (not this branch's, both already on the live site):
- The 404 page's social image points at `http://localhost:3000/opengraph-image` (the default not-found page has no `metadataBase`). `next build` warns about it twice.
- The header is see-through until the scripts start (`SiteMotion` sets `data-scrolled`): a visitor who scrolls in the first second on a slow phone sees the page under it for a moment.

## For the product lane (not changed here)

- **Showcase numbers on a narrow container** scroll sideways with nothing in them to focus (axe `scrollable-region-focusable`, serious). The site sets the four numbers two by two through its own container; the component could do the same in showcase mode, or make the scroller focusable.
- **The workspace's Arabic on Credit accounts** (`(product)/_workspace/Screens.tsx`), which the site draws in the product's words except here: the screen is «دفتر الديون» while the product is «الحسابات الآجلة»; «${n} عميل عليهم مبالغ» needs «عملاء» for 3 to 10; the age buckets print Eastern digits and «يوم» («٠–٣٠ يوم») where the rest of the screen has Western digits; the promise date is formatted `en-GB` («وعد بالدفع قبل 19 Oct»). The drawing uses «الحسابات الآجلة», «5 عملاء», «0–30 يوماً» and «19 أكتوبر».
- `fmt_qar` should be language-aware: Arabic messages write «38 ر.ق», not "QAR 38".

## Open for the founder

1. **Publishing**: the go-ahead, after PR #50 and this one are merged.
2. **The hero's "it"**: the hero says the agent replies and reminds; in the product ALYR Chat and ALYR Bookings send those and ALYR Agent counts them. `/agent` says so in its questions. Keep, or say "ALYR" in the body?
3. **Arabic review** (ALY-66), now about three times as much Arabic.
4. **Clinics** stay off until the lawyer has looked at health data (ALY-51).
5. **Names**: a manual check of Sadaf Salon and Nasma Cooling, as was done for Qirfa (Instagram, Google Maps, the trademark register).
6. **The Sunday report** on WhatsApp needs its `weekly_report` template approved before any owner receives it; the site shows it as built, which it is.
7. **D-037's number**: PRs #51 and #52 both take D-036; renumber at merge if needed.
8. **hello@alyr.qa**: a test mail from outside before publishing.

## What was not checked

- Real phones and Safari: every capture is headless Edge (Chromium). No iOS Safari, no Firefox.
- Lighthouse on desktop; on mobile two runs per page, and LCP moves by about 0.1 s between runs.
- Screen readers by ear (NVDA, VoiceOver): only axe and the accessibility tree.
- The Arabic by a native speaker.
- Widths between 390 and 1440 other than spot checks at 768, 1100 and 1280 during the build.
- The offer switch on beyond the price section's screenshots: no axe or Lighthouse run with it.
- The contact states other than email (WhatsApp number set, or "opens soon").
