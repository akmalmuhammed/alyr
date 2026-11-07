# ALY-330 · Homepage v2, built around the four stages

Founder, 8 Nov 2026: rebuild the homepage with a modern approach, same design system, new
sections, content, animations and components. Study clay.com and its post on its new homepage.
Focused explanations, more visual treats, very minimalist, very easy to understand, very
optimised. Show the new product. Spine: Discover, Convert, Manage, Scale (ALY-302).

## What Clay does that we take (method, not look)

Source: clay.com and clay.com/blog/new-homepage-2026, read 8 Nov 2026.

1. One sentence of positioning, said once, then proven in order. Their post: one idea, five
   primitives, one continuous visual journey down the page.
2. A first screen with one headline, one line, two buttons and one big visual.
3. Proof straight under the hero, in numbers.
4. One full-width panel per idea: small label chip, big headline with one highlighted phrase,
   one sentence, one proof line, one or two links. Every panel has its own visual.
5. An "aha" you can touch on the page itself ("What do you want to build?").
6. Use-case tabs, then stories, then one closing call. Few links, repeated.
7. Product screens organised by the use case that converts best.

## What we do not take

- Their playful 3D illustration, customer logos, customer numbers and testimonials: we have no
  customers yet and invent nothing. Our visual is the product's own screens and one drawn
  funnel (design system principle 6).
- Gradients, glow, glass, bento icon grids, counters, ratings, pills and 22 px radii.

## The page, in order

1. **Header:** as today.
2. **Hero.** Headline and sub line as they are (D-153, D-154). Two buttons. Below or beside:
   one drawn figure, "the funnel": an enquiry moves through four stations, Discover, Convert,
   Manage, Scale, each a crop of the real screen. Plays once, ends on the full path. Fictional
   Qirfa Bakery, one FIG caption.
3. **The five numbers** (proof, honestly): Found, Chosen, Answered, Paid, Return. "We record
   them at the check-up and count them again every month." Drawn as a sample on one hairline,
   captioned "Sample". No invented result.
4. **Four stage panels** (the core, like Clay's primitives). One panel per stage, a sticky
   chapter index 01 to 04 on wide screens. Each panel: chip, headline with one Concrete
   phrase, one sentence, one real screen, and a short list "What runs today" (solid rule, the
   product named) and "What our team does for you" (dashed rule). Nothing "coming".
   - 01 Discover: the check-up, and the team sets up how customers find you (Google profile,
     link in bio, QR card). All "our team does".
   - 02 Convert: ALYR Chat, Shelf, Bookings. One inbox, orders, bookings, a link to the menu.
     Payment link: not shown as available (payments are on hold).
   - 03 Manage: Accounts (credit), Docs (receipts, invoices), Agent (the week in numbers).
   - 04 Scale: the monthly review: the five numbers again, three actions, then the next stage.
5. **Pick your business** (the aha). Tabs by business type; the panel shows that business's
   four stages in its own words. Reuse `BusinessTabs` and `FoldSplit` where they fit.
6. **One record, every product** (`ProductRoom`, kept): the entry typed once, seen everywhere.
7. **Then we check again** (How we work, kept, trimmed to the loop).
8. **Price** (offer switch, unchanged), **Questions**, **closing call**, **footer**.

Cut from today's page: the Agent spotlight (it moves into Manage and Scale), the Office
statement, "One order, start to finish" (becomes Convert's visual), the duplicate How lead.

## Rules this page must keep

- No AI or agentic wording except the headline, sub line, title, description (D-153).
- Every claim true today (`honesty.md`, `docs/status.md`). Discover and Scale are delivered by
  the team today: say "our team", never imply software that is not built.
- Words only in `copy.ts` (or a copy file it imports), English and Arabic. Arabic is a draft
  until ALY-66; tell the founder.
- Tokens only, both themes, logical CSS, RTL cuts mirrored, 44 px targets, 320 px clean.
- Motion plays once; reduced motion shows the end state; nothing hidden without scripts;
  animate transform, opacity and clip-path only; one Volt button per view.
- Fast: no new dependency, no new font, no layout shift; the first screen's picture is HTML
  and CSS, not an image download. Budget: Lighthouse mobile Perf 90, A11y 100, LCP 2.5 s.

## Founder decisions this brief assumes (confirm on the preview)

1. The four stages replace the six-product frame as the page's spine.
2. Discover and Scale appear as "our team does this" because that is true today.
3. The agent spotlight and the Office statement are cut.
4. The first screen keeps the D-153 headline.
