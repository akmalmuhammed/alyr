# Status page: a proposal

ALY-34 asks for "a status page and an incident checklist". The checklist exists
([incident-response.md](incident-response.md): the first ten minutes, how to stop harm, what to tell merchants,
the review afterwards). **The status page does not exist.** This page is the plan for it. Written 30 Oct 2026.
**Nothing here is built, no account is opened and no address is published.** It needs the founder's yes;
the decision entry is written with the first page.

## Why one, and what it must not do

When WhatsApp replies stop, a shop's owner has one question: is it them or us? Today the answer is a
message from the founder, one shop at a time (OPS-16 in the go-live audit: "no status page"). A page the
owner can open themselves answers it without anyone writing, and gives the founder one place to point at.

It must not:

- **Be hosted on what it reports on.** Google Cloud in Doha serves the product and Cloudflare serves the
  addresses and the public site. If the page lives on either, the outage that matters takes it down too.
- **Hold personal data.** No subscriber list, no sign-in, no analytics, no third-party script. Then it
  needs no row in `docs/data-residency.md` (hard rule 2) and no processing record (ALY-120).
- **Say "all good" by itself.** A page that nobody updates is wrong in the worst way, so it says who last
  looked and when, and the words on it never claim a check that did not happen (see "Wording").

## What it shows

Five lines, the ones a shop owner can feel, each `Working`, `Slow or partly down` or `Down`:

| Line | Stands for | The check behind it today |
|---|---|---|
| WhatsApp replies | Meta's webhook to `api.alyr.qa`, the worker sending | Uptime checks on `api.alyr.qa/health/ready`, `/health/worker`; the alert "No WhatsApp message received" |
| Workspace and sign-in | `app.alyr.qa` and the emailed code | Uptime check on `app.alyr.qa/login`; Resend |
| Customer pages | Order, booking, payment and document links | Uptime check on the web app |
| Reminders and reports | The worker | `/health/worker` |
| alyr.qa | The public site | Uptime check on `alyr.qa` |

Below them: **current notice** (empty most days), and **the last ten notices**, each with start, end, what
customers saw, and what it meant for a shop. Meta's own WhatsApp status is linked, because an outage there
is not ours to fix but is ours to explain. English and Arabic on the same page (hard convention: no
user-facing text in one language only).

## Where it is hosted (recommended) and the options

| Option | Cost | Independent of Google and Cloudflare? | Personal data | Who updates | Verdict |
|---|---|---|---|---|---|
| **A. One static page on GitHub Pages, in its own small public repository (`alyr-status`), at `status.alyr.qa`** | 0 | Yes: GitHub serves it, only the DNS record is on Cloudflare | None | Whoever can commit to that repository: the founder, in the browser | **Recommended.** Free, nothing to run, separate from the product's release gates, and the repository's history is the incident log |
| B. A hosted status product (Instatus, Better Stack, Atlassian Statuspage, free tiers) | 0 to start; paid for custom domain or subscribers | Yes | Subscriber emails sit outside Qatar, so a row in `data-residency.md` and a lawyer's look (ALY-51) first | The founder in a dashboard, plus automatic checks from outside | Later, at about ten clients, if owners ask to be subscribed. Its outside checks are the one thing option A lacks |
| C. A page under `alyr.qa/status` on the Cloudflare site | 0 | No: the site and the edge share Cloudflare | None | A site release (`docs/runbooks/release.md`), which is slow and gated | No: too slow in an incident |
| D. A page on Cloud Run or Cloud Storage in Doha | 0 to a few cents | No: the same project as the product | None | A deploy | No |

Option A in practice: one `index.html`, one `status.json` (the five lines and the notices, both languages),
no build step, no JavaScript beyond reading `status.json` and drawing it, no external fonts. HTTPS by
GitHub Pages. The only DNS change is one `CNAME` for `status` (Cloudflare, "DNS only"), which is the
founder's yes to give, with the usual check that the target answers first.

Why a separate repository and not a folder in `alyr`: the main repository's `main` needs a green `ci` and a
release version, and an incident notice cannot wait 35 minutes for CI. The status repository has no code
to break and no secrets.

## Who updates it, and when

| | |
|---|---|
| **Who** | The person on call (today the founder; `incident-response.md`, top). The operator agent may draft the wording from the incident notes, never publishes: a notice is outward-facing, so the founder presses the button |
| **When to post** | A Severity 1 or 2 that has lasted 15 minutes, or that merchants have already noticed. Within 30 minutes of starting. Do not wait for the cause |
| **When to update** | Every 60 minutes while it lasts, even with "no change", so a stale page is visibly stale |
| **When to close** | When the health checks have been green for 15 minutes and the first real customer message after the fix was answered |
| **Planned work** | A notice 24 hours before anything that closes the API or the database on purpose (a restore, a Cloud SQL maintenance window that matters) |
| **Afterwards** | The review (`incident-response.md`, section 9) links the notice; the notice links nothing internal |

Section 1 of `incident-response.md` already says to post there once the page exists; until then it says to
tell the merchants directly (section 7).

## Wording (rules for every notice)

- Say what customers saw, in their words: "Customers who wrote between 14:00 and 16:00 got no reply."
  Never a cause that is a guess, a vendor's name as blame, or "some users".
- Doha time, with the date. A time the page can show as "updated 14:20 (Doha)".
- Say what a shop needs to do, or "nothing".
- No names, numbers or messages of any customer, no shop names, no exploit detail. A breach is told to the
  affected shops directly first (`incident-response.md`, sections 6 and 7); the page says "an incident
  affecting some shops, who have been told".
- The Arabic is read by a native speaker before the first real notice (ALY-66), like the merchant email.

## The steps, when the founder agrees (about an hour; none of it is billable)

1. Founder: create a public repository `alyr-status` under the same GitHub account, enable Pages from
   `main`. Nothing secret goes in it. Add the account to `docs/access.md` ("GitHub: alyr-status").
2. Claude (site-and-brand lane, because customers read it): build `index.html` and `status.json` to the brand
   rules (`docs/brand.md`), both languages, light and dark, phone width. Review with the design-review skill.
3. Founder: set the Pages custom domain to `status.alyr.qa`; add the `CNAME` in Cloudflare (DNS only).
   Check from outside: `curl -sI https://status.alyr.qa` answers 200 over HTTPS.
4. Founder and Claude: rehearse. Post a test notice marked as a test, read it on a phone, remove it.
5. Same pull request as the build: rows in `docs/stack.md` and `docs/access.md`, the `incident-response.md` wording
   (drop "a plan today"), `/privacy`'s list of services if it names hosts, and the go-live checklist line.
6. Link it from the foot of the workspace and from the hello@alyr.qa auto-reply, after step 4.

## What this does not do

It does not monitor. The Google uptime checks and the alerts watch (`monitoring.md`); a person looks and
writes. If that proves too slow or too easy to forget, the answer is option B's outside checks, not an
auto-generated "all systems operational" on option A. It does not promise a response time or an uptime
percentage: the draft customer agreement says ALYR does not promise a response time (OPS-16 is about that gap),
and a page that implied one would be a promise by the back door.
