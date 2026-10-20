---
name: alyr-site-page
description: Build or change a public ALYR web page or anything on it. Use for the homepage (/ and /ar), the product pages (/chat, /bookings, /agent, /accounts, /shelf, /docs and their /ar pages), adding a new product page, the header, Products menu, theme switch, product bar, footer, closing call, contact states, the offer switch, FIG-captioned drawings of product screens, the "works with" rows, the sitemap, metadata and social cards, and anything under apps/web/app/_site, apps/web/app/(site) or apps/web/app/(site-ar), or scripts/build-site.sh. Load alyr-design first.
---

# A public ALYR page

The public site is static HTML on Cloudflare, built from Next.js by `scripts/build-site.sh`.
Three root layouts: `(site)` English, `(site-ar)` Arabic (`lang="ar" dir="rtl"`), `(product)`
the app. Their CSS never mixes. Every word is in `apps/web/app/_site/copy.ts`. The Site and
brand lane owns these files (`docs/lanes/site-and-brand.md`).

## Before you start

1. Load `alyr-design` and read it.
2. Read `docs/brand.md` (the story and the site's extensions) and the lane brief's "Now".
3. Read the decisions behind the page: D-034 (product first, prices off until the CR),
   D-035 (the suite), D-037 (the site presents the suite), D-038 (the report card), D-039
   (nothing "coming" at go-live).
4. Check every claim you will make against `docs/status.md` and the code
   (`alyr-design/honesty.md`).
5. Work in your own worktree on a branch named after the Linear issue; never in
   `D:\alyr whatsapp`, never on port 3100.
6. For a new page or a redesign, run the full cycle in `alyr-design-review` (research, truth,
   founder decisions, brief, build, critics, rulings, fix).

## The homepage

In order (`_site/HomePage.tsx`, `home.css`, words under `home` in `copy.ts`):

1. **Header** with the Products menu, By business, How it works, Questions, the language
   link, the theme switch and the contact button (Price only with the offer).
2. **Hero:** eyebrow "ALYR · At work for you", H1 "Your business just got an agent.", a body
   that names who does what and says "by rules you can check", the contact button, the note
   ("A person from ALYR replies." and the address), the facts row; beside it, on the Carbon
   plate, the real ALYR Agent dashboard in showcase mode and the live feed (newest on top,
   a rule line in the first screen). Phones: the feed first, then the window.
3. **Agent spotlight:** the whole dashboard with numbered callouts and the sample switch
   (Bakery, Salon, Home services), opening on the salon.
4. **The suite** on the Carbon band, entered through the fold: each product in order with a
   crop of its real screen.
5. **By business**, **How it works** (step 4 is the report card as a WhatsApp message),
   **Trust** (as ALYR, no founder), **Questions**, the **closing call**, the **footer**.

## The product page template

Every product page uses `_site/ProductKit.tsx` and `kit.css`, in this order:

| Block | Component | Rule |
|---|---|---|
| Product bar | `ProductBar` | Name with the signal and its sections; sticky; no call to action |
| Opening on Carbon | `ProductHero` | Eyebrow with the state, a two-line H1 that names the result (second line Concrete), the lead, a tabbed demo (`ProductDemo`), three facts on one rule. Cut corner, not rounded |
| How it works, from both sides | `FlowSection` (`FlowDiagram`) | The customer's steps and the business's, in the product's real words |
| The screen used every day | `ScreenBlock` | The real workspace screen at true scale in the workspace window, numbered Carbon callouts beside it; on phones the workspace's phone layout (cards), never a sideways table with no cue |
| What's in it | `InsideBlock` | Everything it does today by audience, then **Not yet** below a dashed rule with the pending dot |
| Who it's for | `WhoBlock` | Rows by business type with what each uses; tags in suite order |
| Works with the rest of ALYR | `WorksBlock` | Ruled rows in the suite's order without the page's own product |
| Questions | `QuestionsBlock` | Native `<details>`, an `id` per question; "Can I use it on its own?", "How long does setup take?" |
| Closing call | `Shell` | The fold at its top, the contact block in its state |

Each page has its own English social card (`(site)/<page>/opengraph-image.tsx` through
`_site/socialCard.tsx`). Arabic pages share the English homepage card until Arabic cards are
drawn with resvg (`alyr-generated-image`).

## Adding a product page

**First, may it exist?** A product gets a page only when it is built and the founder has
said so (D-039: nothing "coming" is shown to an owner or customer at go-live; on 20 Oct
2026 the founder took Payroll off the site until it is built). **"A coming-soon page for
ALYR Payroll" is therefore not something to build**, and nothing names it. Stop, label the
issue "Needs Akmal", and ask: is it built and in the catalogue as live, and does he want its
page now? A product that is built but still off for shops can have a page only on his word,
and then its page never says it is available (ALYR Docs, 20 Oct 2026).
You may draft its words and claims in the work folder (`docs/work/ALY-NN-.../`) for his
review; nothing goes into `copy.ts` or a route.

Once a product is built and approved, the page needs every one of these, or it is built and
silently not published, or published and not linked:

1. **`_site/site.ts`:** its key and both addresses in `PATHS` (feeds the canonical link,
   hreflang, the language link and the sitemap); keep `PRODUCTS` in suite order
   (`productPath()` returns `PATHS[key]`; every product listed has a page). If it comes with
   every product, add it to `INCLUDED`.
2. **`_site/copy.ts`, both languages, typed:** `meta.<key>` (title, description,
   `descriptionNoOffer`) and the `meta` key union; a `pages.<key>` type and both objects;
   `products.items.<key>` (name, descriptor, line, state) for the menu; `works.rows.<key>`
   on every other product page; the homepage suite row (`home.suite.rows` is typed by every
   `ProductKey`), its business tags and the Products menu line. A page with a lot of words
   can keep them in its own copy file (`copyShelf.ts`, `copyDocs.ts`) that `copy.ts` imports.
3. **The page component** `_site/<Name>Page.tsx` from `ProductKit` blocks.
4. **Routes in both groups:** `app/(site)/<key>/page.tsx` and
   `app/(site-ar)/ar/<key>/page.tsx`, each with `siteMetadata(locale, "<key>")`.
5. **Social card:** `app/(site)/<key>/opengraph-image.tsx`.
6. **`scripts/build-site.sh`:** add the key to `pages=`; that one list copies the HTML in
   both languages, the social card and the deferred-scripts step. It fails if the card is
   missing.
7. **Homepage:** the suite crop in `HomePage.tsx` (`crop` record) drawn from the product's
   real screen, and the suite row's link.
8. **Menu, footer and "works with" rows** read `PRODUCTS` and `productPath`, so they turn into
   links once step 1 is done; check each, in both languages, with the menu open.
9. **Check:** `bash scripts/build-site.sh` passes; `out-site/<key>.html`,
   `out-site/ar/<key>.html` and the card exist; `sitemap.xml` lists both addresses; the
   language link lands on the same section.
10. **Docs in the same PR:** `docs/brand.md` (the suite on the site), `docs/status.md`, the
    lane brief's "Now", and a decision entry if it changes a recorded decision (check the
    next free D-number on `origin/main` right before committing).

## Do

- Draw the product's real screens in its exact words (status names, buttons, times as it
  prints them); prefer samples captured from the engine to hand drawings.
- One sample business per figure set; FIG caption on every drawing.
- The contact block from `Contact.tsx`; prices only through `OFFER_LIVE`.
- Logical CSS; `[dir="rtl"]` only for what cannot mirror; every cut mirrored.
- Name heading line breaks in copy; check 320 px.
- Static HTML first: anything live (clock, steppers, observers) runs after hydration and the
  HTML is complete without it. No server code, no `cookies()`, `headers()`, API calls.
- Images imported from code (they land in `_next/static`), plain `<img>` with width and
  height, or `next/image` with `unoptimized`. There is no `public/` folder on the site.
- Keep the page's own JavaScript small; GSAP only where it is already used.

## Don't

- Put a word in a component, including `aria-label`s, alt text and captions.
- Show a price, a coming product, AI wording or a must-not-claim line.
- Style a bare element from a container (`.top-nav a` once broke the Products menu), or
  reuse the Agent's `ag-` class prefix in a site drawing.
- Add a second Volt button, a carousel, a pop-up, a cookie banner, a logo wall, a counter,
  a third-party script or analytics (also a data-residency question).
- Add a dependency without a one-line reason in the PR.
- Deploy. `npx wrangler deploy` is the founder's laptop and the founder's yes, each time.

## Done when

- [ ] Every word in `copy.ts`, both languages; `/ar` has no stray English.
- [ ] Claims checked against `docs/status.md` and `alyr-design/honesty.md`, including meta,
      social card and alt text; no AI words; samples captioned once.
- [ ] Looked at: both languages, 1440, 390 and 320, light and dark, reduced motion, no
      scripts, the Products menu and the phone menu open, every contact state touched.
- [ ] No horizontal scroll at 320; targets 44 px; focus visible; headings in order.
- [ ] `pnpm lint`, `pnpm exec tsc --noEmit`, `bash scripts/build-site.sh` pass.
- [ ] axe zero serious or critical; Lighthouse mobile on changed pages ≥ 90, LCP < 2.5 s,
      CLS < 0.05.
- [ ] `/chat` and every page sharing a changed component still look as before.
- [ ] Docs updated; screenshots listed in the PR; "Not checked" written; founder asked
      before any publish.
