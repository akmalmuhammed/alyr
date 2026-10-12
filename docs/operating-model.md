# How ALYR runs: one founder, six lanes of agents

Written 12 Oct 2026. This is the map of who does what. `docs/status.md` says where things stand; Linear (team `Alyrtech`, project `Alyr Launch`) holds the tasks; this page says how the work is divided and what the rules are.

## Where we are, honestly

ALYR is one week old, **before its first customer and before its first live message**.

| Built | Not yet true |
|---|---|
| A working product on a simulator: inbox, ledger, order link, payments stand-in, bookings API, sign-in, 148 tests | No message has gone through Meta's real platform |
| A public site, live, in English and Arabic | No way for a visitor to contact us; Arabic unreviewed |
| A go-to-market plan and a brand playbook | No business owner has seen the product; no interviews logged |
| Decisions written down (25 so far) | No company, no payment provider, no agreed price, two brand systems, three different "first customers" |

The risk is no longer "can it be built". It is building more before anyone has said they want it, while the slow outside waits (company registration, Meta verification, a payment provider) have not started.

## The one goal for this stage

**One real business, live on its own WhatsApp number, paying.** Everything is judged by whether it moves that forward.

| Gate | It is passed when | Lane |
|---|---|---|
| A. Decide | First customer type and district, the look, and the price are chosen (ALY-57, ALY-61, ALY-62) | Founder |
| B. Listen | 20 owner conversations logged; 3 say yes to a pilot (ALY-58) | Customers |
| C. Go live | A real message round trip on Meta; the API runs without the laptop; company registration filed (ALY-12, ALY-63, ALY-59) | Go-live, Company |
| D. Pilot | One business uses it daily for two weeks on its own number (ALY-31) | All |
| E. Paid | That business pays (ALY-37) | Customers |

**Rule for the Product lane until gate B:** build only what a named pilot business needs. No new modules on a guess.

## The six lanes

Each lane has one brief in `docs/lanes/`, one Linear label under "Lane", and one agent definition in `.claude/agents/`. A task belongs to exactly one lane.

| Lane | What it owns | Files it may change | Brief |
|---|---|---|---|
| Product | The API, modules, workspace screens | `apps/api/`, `apps/web/app/(product)/` | [product](lanes/product.md) |
| Go-live | Meta, templates, hosting, monitoring, payment gateway | `infra/`, `scripts/`, `apps/api/src/alyr/channels/`, deployment config | [go-live](lanes/go-live.md) |
| Site and brand | Public site, brand system, how product screens look | `apps/web/app/_site/`, `(site)/`, `(site-ar)/`, `docs/brand.md` | [site-and-brand](lanes/site-and-brand.md) |
| Customers | Finding, interviewing, piloting, signing | `docs/customers/` | [customers](lanes/customers.md) |
| Growth | Content, programmes, partnerships | `docs/growth/` | [growth](lanes/growth.md) |
| Company | Registration, legal, pricing, providers, money | `docs/company/`, `docs/data-residency.md` | [company](lanes/company.md) |

One more role sits above the lanes: the **operator**. It does not build. It runs the weekly review, keeps Linear and `docs/status.md` true, and tells the founder what only the founder can do.

## What only the founder does

Agents prepare; the founder acts. These carry the Linear label **Needs Akmal**, and that list is the founder's own to-do list.

- Talk to business owners, partners, a lawyer, a reviewer.
- Decide: customer, price, look, promises made in public.
- Sign, register, pay, create accounts, accept terms, enter passwords and secrets.
- Approve anything that goes public: a deploy, a post, a message to a real person.

The founder's attention is the scarcest thing in the company. More agents do not create more of it. **Run at most three lanes at a time**, and clear the Needs Akmal list before starting new agent work.

## Rules every agent follows

These exist because each one was broken once in the first week.

1. **The repo is the memory, not the chat.** A session ends, compacts or collides; a file does not. Anything the next agent needs goes in `docs/` or Linear before the session ends.
2. **One issue, one branch, one pull request.** Branch named after the issue. Never commit to `main`. Merge on green CI.
3. **Stay in your lane's files.** If the task needs a file another lane owns, say so in the pull request and keep the change small. Two sessions edited the same pages on 11 Oct and one session's work was thrown away.
4. **Update the truth in the same pull request:** `docs/status.md`, your lane brief's "Now" section, and the Linear issue, including what is still missing.
5. **Say what was not checked.** Every pull request and every report ends with it.
6. **Nothing public without the founder's yes, each time.** On 12 Oct a redirect was switched on before the target address worked and the live site was unreachable for three minutes.
7. **No promise the company cannot keep today.** No invented numbers, clients or dates on anything a customer sees.
8. **Nothing paid without asking. Research first, then bring a choice.**
9. The hard rules in `CLAUDE.md` (tenant isolation, official WhatsApp only, consent, no secrets in git) outrank everything here.

## The rhythm

| When | What | Who |
|---|---|---|
| Start of any session | Read `docs/status.md`, then the lane brief, then the Linear issue | Agent |
| End of any session | Pull request merged or handed over in writing; issue updated | Agent |
| Weekly | The `weekly-review` skill: what moved, what is stuck, the founder's list, next week's three lanes | Operator, then founder reads it |
| When a decision is made | An entry in `docs/decisions.md` in the same pull request | Whoever made it |

## How to run it in Claude

- **One session per lane, not one session for everything.** Start it with: "You are the Customers lane. Read docs/lanes/customers.md and take ALY-58." The agent definitions in `.claude/agents/` carry the same instruction, so a session can also hand a task to a lane agent.
- **Cloud sessions for work that needs no laptop** (anything on the simulator, documents, research). They read the same repo files and agent definitions. Push first; they clone from GitHub.
- **Laptop sessions for work that touches the laptop:** secrets in `.env`, the Cloudflare deploy, live Meta tests.
- **Parallel sessions on the same repo use separate worktrees or separate branches.** Never two sessions on one checkout.
- **A scheduled routine can run the weekly review** in the cloud and open a pull request with the result. It should not deploy or message anyone.
