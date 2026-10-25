# What is true today: marketing, sales, growth, design and social

The studies in this library were written over three weeks and disagree with each other. This
page says which answer stands **today**, and where. When it and a study disagree, this page
wins; when it and `docs/decisions.md` disagree, the decision log wins and this page is wrong
(fix it). Checked against `main` on 24 Oct 2026.

## The answers

| Topic | Today's answer | Source that decides | Older answers you will still meet |
|---|---|---|---|
| **What ALYR is** | The technology team an owner-run business never had: check, set up, see, improve, check again. WhatsApp is one product and the way in, not the whole company | D-048 (23 Oct) | "Digital transformation partner" (design system v1, 11 Oct); "WhatsApp front desk" (D-016 to D-024); "the business agent" (D-035, 17 Oct) |
| **Homepage headline** | "The tech team your business never had." / «فريق التقنية الذي لم يكن لدى مشروعك.» | D-048 | "Go digital without the IT team" (playbook, 16 Oct site); "Your business just got an agent." (17 Oct); "Stop losing orders in the chat." (D-056, 22 Oct) |
| **One action** | "Book a check-up" on every page | D-048, update 24 Oct | "Talk to us", "Message us on WhatsApp" |
| **Master line** | "You have two jobs. We take one." The founder said yes in the films direction doc on 24 Oct, but it is **not yet in `docs/decisions.md`** and live copy still carries "We do the tech. You run the business." | Films direction (Claude Doc, 24 Oct); needs a decision entry | "Transform the business. Not just the interface." (v1) |
| **Products on the site** | ALYR Chat, Bookings, Agent, Accounts, Shelf (the Catalog), Docs (Documents). Every product's state is "Set up for you". Payroll off the site | D-046 (21 Oct), D-035 | Playbook: Chat, Pay, Books, Sites. 17 Oct: Payroll "coming" |
| **"Agent" and AI** | "Agent" only beside its rules or counts; no AI words; no «وكيل» in Arabic | D-056, `.claude/skills/alyr-design/honesty.md` | "AI-powered" in early plans |
| **Price** | From QAR 449 a month; setup quoted at the visit, "from QAR 1,500" on the page; each client's price set by quote in the back office; the client pays before products open | D-034, D-032, D-051 | QAR 199 (playbook); 490 / 890 + 40 per seat + 2,500 setup (D-017, superseded); 450 to 1,200 (master plan); 449 + 150 per extra product (17 Oct suite appendix) |
| **Prices on the public site** | Not until the commercial registration (CR): selling or showing a priced service before it may be illegal | D-034 update 17 Oct, customer agreement notes (PR #47) | Price shown on the 16 Oct homepage plan |
| **First month** | Paid, money back if the agreed result is missed in the first 30 days after going live; setup fee never refunded. No free plan, no free trial | D-034, D-051 | Free 14-day pilot (playbook); "first month free if no booking" (back-office draft, D-032: **still in the product, conflicts with D-034**) |
| **Who we sell to** | Every owner-run business, Qatar first, then the GCC; the first ones book, order, pay and track | D-043 (on the unmerged branch `company-introduction`), D-024 | Credit wholesalers (master plan, 7 Oct); restaurants and cafes (playbook); six business types (growth plan, 18 Oct) |
| **Founder on the page** | Left out: no name, no photo; ALYR speaks as a company | D-034, D-043 | The growth plan, founder posts and video V7 rely on the founder's face (written before D-043) |
| **Look** | Carbon and Volt; Instrument Sans, IBM Plex Sans Arabic, IBM Plex Mono; one token file (`design/tokens.json`) | D-040, `docs/brand.md` | Cobalt #2747F5, lowercase "alyr", Bricolage and Geist (playbook, retired); maroon #8a1538 (early planning pages) |
| **Sample marks on drawings** | A "Sample" mark | Site audit decisions, 24 Oct (`docs/site-audit/00-decisions.md`) | "FIG" captions (the growth plan, the Figma kit, the video plan still use them) |
| **Social and decks** | Rules in `.claude/skills/alyr-deck-and-social`: Paper or Carbon, never cobalt; light Gulf Arabic on Instagram, TikTok and Snapchat, MSA on LinkedIn; no customer numbers, faces or prices until the CR | The skill (applies D-040, D-034) | The playbook's deck ("48 hours", three plans, "local team") |
| **When we post** | Not yet: the Growth lane stays quiet until there is a first customer and one true story | `docs/lanes/growth.md` | The growth plan's phase 0 (claim handles, weeks 1 to 4 calendar), ready but not approved |

## Conflicts the founder must settle
1. **Record the 24 Oct film answers as a decision:** the master line "You have two jobs. We take one.", actors on screen, a free check-up and keeping the monthly look at the numbers. They are in the films doc only; the site and other docs still follow the older answers.
2. **Has the commercial registration been issued?** Two 22 Oct studies say yes (since 21 Oct); the 24 Oct content and film plans and `main` still say "before the CR". Every "after the CR" rule here (prices, contracts, customer numbers in posts) hangs on this.
3. **First month:** the back office still offers "first month free if no booking in 30 days" (D-032), which contradicts D-034's paid, money-back month. One must change.
4. **Founder visibility in growth:** the growth plan recommends the founder's face leads the videos; D-034 and D-043 leave the founder out.
5. **Merge or close** the `company-introduction` branch (D-043) and the `growth-launch-plan` branch; their content is preserved in `sources/` here.
