# ALYR suite site: build brief (homepage, product pages, `/chat` changes)

17 Oct 2026. The creative director's brief for the site builder. **Order of authority:**
1. `00-founder-decisions.md`.
2. This brief.
3. `06-messaging.md`: the words.
4. `01-research.md` D and E: the product page template and what to avoid.
5. `05-critique.md`, "As a homepage figure".
6. The homepage research and rulings in `D:\alyr-home\docs\site-redesign\` (01, 04, 08): art direction, motion system, honesty rules.

## 1. Founder decisions since `06-messaging.md` was written

- **Hero.** Replaces 06 §2.3's options.
  - Eyebrow: "ALYR Agent · At work for you".
  - H1: "Your business just got an agent."
  - Body: "It replies to the routine, sends the reminders, follows up what's owed and tells you what needs you, right in your WhatsApp. We set it up in your shop. You run the business."
  - Arabic drafts, for native review (ALY-66):
    - eyebrow: «ALYR Agent · يعمل عنك»
    - H1: «صار لنشاطك من يعمل عنه.»
    - body: «يردّ على الرسائل المعتادة، ويرسل التذكيرات، ويتابع المستحقات، ويخبرك بما يحتاجك، داخل واتساب. نجهّزه لك في محلك، وأنت تدير عملك.»
  - Keep 06's shared button, note and facts row.
  - Before shipping, check every verb in the body against the product (`02-data.md`, the engine):
    - If payment reminders for credit accounts are sent only when the owner presses "Send reminders", write "helps you follow up what's owed" (Arabic «ويساعدك في متابعة المستحقات»).
    - Routine replies mean the automatic menu and acknowledgement replies the product really sends. Do not imply it answers free questions.
- **The live agent feed.**
  - Beside the dashboard figure, a feed of the agent's actions arrives one by one, each with a time and a Volt tick, and the "Done for you" count steps up with each.
  - Use only event types the product really performs and logs: an automatic reply with the menu, a booking reminder sent, an order confirmation sent, a payment reminder sent, an item flagged by a rule (with its rule line).
  - The words come from the selected sample's own data, so they are consistent with the dashboard.
  - A status chip reads "ALYR Agent · Running" («ALYR Agent · يعمل») with a dot that lights once (never an endless pulse).
  - Caption it as a sample, for example "FIG 01 · An afternoon at a fictional bakery, sample data".
  - Reduced motion: the composed feed, with no ticking. No JS: the full feed shows.
- **No AI** anywhere: not as a claim, not as "coming". The founder will add the line when AI ships.
- **The samples** are **Bakery / Salon / Home services** (an AC company), not a clinic: health data needs the lawyer first. Clinics stay listed under "By business" only if 06's wording makes no health-data claim; otherwise leave clinics out for now.
- **Leave "paid through ALYR links" out** of the public samples. There is no payment provider yet.
- **Pricing appendix (behind `NEXT_PUBLIC_ALYR_OFFER=on`):** from QAR 449 for the first product, +QAR 150 for each extra, Agent included. The switch stays off.

## 2. What to build

1. **The homepage** (`/`, `/ar`), in 06's section order:
   - header with a Products menu;
   - hero with the dashboard and the live feed on the Carbon plate;
   - Agent spotlight with the Bakery / Salon / Home services switch;
   - suite;
   - by business;
   - how it works;
   - trust;
   - questions;
   - closing call;
   - footer.

   Keep what works from the live page: the 45° fold, the Carbon plate, FIG captions, the motion system, the theme switch, the contact states, the offer switch, the rhythm and type.
2. **The Products menu.** On desktop, a panel under the header listing all five products: name, one line, state, and a link where one exists. Payroll is dashed, with no link. On phones, a group inside the existing menu. It must work by keyboard, close on Escape, carry the right ARIA, and mirror in RTL.
3. **The dashboard figure.** Import the real `AgentDashboard` from `apps/web/app/_agent/` in its showcase mode, fed with `samples/{bakery,salon,homeservices}.{en,ar}.json`. The homepage shows the crop that the critique's "As a homepage figure" recommends. It follows the site's light and dark theme. Nothing in it links into the workspace.
4. **Product pages `/bookings`, `/agent`, `/accounts`,** in English and Arabic, following 01 D's template and 06 §3's words.
   - Reuse `ProductPage`'s building blocks where they fit (the tabbed demo, `FlowDiagram`, the "everything it does today" lists), so the four product pages feel like one family.
   - Draw the real screens 01 D names for each page.
   - `/agent` uses the same `AgentDashboard` showcase as its hero.
   - Each page ends with "Works with the rest of ALYR" rows in the fixed order Chat, Bookings, Agent, Accounts, Payroll.
   - Honesty flags from 01 D: one booking at a time, so no parallel chairs or per-stylist calendars; no live payments; no report screen.
5. **`/chat` changes** from 06: bookings move to `/bookings`, so `/chat`'s demo and words focus on orders, the team inbox and tracking. Link to `/bookings` where a visitor will look for it.
6. **Plumbing.** For each new page:
   - routes in both route groups;
   - `PATHS`;
   - `scripts/build-site.sh`, including the deferred-scripts list;
   - the sitemap;
   - metadata and theme-color.

   Update the OG image to the new headline. The language link keeps the section, as it does today.

## 3. Rules

- Every word is in `copy.ts`, in English and Arabic. Arabic follows 06 §6 and the earlier rulings: Modern Standard; currency is the amount, then «ر.ق»; Western digits; `<bdi>`; Latin product names with Arabic descriptors; ALYR Agent's descriptor is «نشاطك بالأرقام».
- No AI words (06's list). Sample screens are captioned as samples of fictional businesses. No invented customers or metrics.
- Logical CSS, both themes, both directions. Reduced motion and no-JS must work. AA contrast. Targets of 44 px or more.
- Static export only. GSAP only where it is already used. Keep the performance budget: Lighthouse mobile ≥ 90, LCP < 2.5 s and CLS < 0.05 on `/` and on each new page. The dashboard figure must not push LCP: render it as static HTML and keep it light.
- Do not change product code under `(product)` or the API. If the component needs a change for showcase use, write it down in the build log for the product agent and work around it.

## 4. Workflow

- **Worktree.** Work in `D:\alyr-home` on a new branch `aly-99-suite-site`, cut from `origin/aly-agent-dashboard` (PR #50, which brings the component and samples). Merge `origin/main` too. Never touch `D:\alyr-agent` (the product agent works there), `D:\alyr whatsapp` or the other worktrees. Never use port 3100.
- **Preview.** Use a dev server with `ALYR_DIST_DIR=.next-preview` on a free port, or serve `out-site` after `bash scripts/build-site.sh`. Stop the server before rebuilding.
- **Screenshots.** Headless Edge: `node docs/site-redesign/baseline/shoot.mjs …` with `--at`, `--offset`, `--settle` and `--eval`, profile `C:\t\suiteprof`. Cover every page in both languages, at 1440 and 390, in light and dark, with reduced motion; also the Products menu open, each sample in the switch, and the feed mid-run and composed. Save them to `docs/agent-dashboard/shots-site/` (not committed).
- **Commits.** Commit in stages: plumbing and menu; homepage; `/agent`; `/bookings`; `/accounts`; `/chat` changes; polish. After each stage, append to `docs/agent-dashboard/08-site-log.md`.
- **Checks:** `pnpm lint`, `pnpm build`, `bash scripts/build-site.sh`, axe (zero serious or critical) and Lighthouse on every page.
- **Docs.** Add a decision entry if the site changes a recorded decision; check the next free number on `origin/main` before committing. Update `docs/status.md` and `docs/brand.md` (the Products menu, the live feed, the product page template).
- **PR.** Push and open a PR against `main` that says it depends on #50. Do not merge or deploy.
