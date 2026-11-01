# Browser journeys (ALY-122)

The paths that must never break once clients depend on ALYR, run in a real browser (Playwright,
Chromium) against the real stack: PostgreSQL, the API in local mode and the web app as `next build`
made it. Nothing is mocked. They run in CI as the `e2e` workflow (`.github/workflows/e2e.yml`), which is
the reference for how the stack is started, and take about 30 seconds of testing on a laptop.

| Journey | File | What it proves |
|---|---|---|
| A. A new owner signs up | `tests/signup.spec.ts` | Email, the code, the business, the steps, the private test line (a real order, or a real booking), and the plan step saying **ALYR is preparing your price**. A bakery in English (also at 390 px), a salon in Arabic, right to left |
| B. Sign in and come back | `tests/signin.spec.ts` | `/login?next=/ops/clients` lands ALYR staff on that page, a non-staff owner in `/app`, and an address off the site is ignored |
| C. Products | `tests/products.spec.ts` | The six products are listed; switching one off hides its screens and keeps every record, switching it on brings them back |
| D. A customer orders | `tests/order.spec.ts` | "menu" to the shop's WhatsApp, the order page, an order placed, and the owner sees it in Orders (also at 390 px) |
| E. A customer books | `tests/booking.spec.ts` | "I want to book", the booking page, a booking made, and the owner sees it |
| F. The back office | `tests/backoffice.spec.ts` | `/ops` is a closed door for anyone who is not ALYR staff (signed out or signed in), and staff see a business that has just signed up waiting for its price in the Today queue |

Two Playwright projects run the same test bodies at two widths: `desktop` (1280 px) runs everything,
`phone` (390 px, touch) runs the tests whose title carries `@phone`. Every journey makes its own
people and shop, so tests do not wait for or disturb each other. The one exception is C, which
switches ALYR Accounts off and on again on the demo shop and puts it back whatever happens.

## Running them on a laptop

You need PostgreSQL 16 (`docker compose up -d postgres`), `uv`, Node 22 and `pnpm`.

```bash
# 1. The API: migrated, with the demo shop and ALYR's staff member (seed), as a developer machine
cd apps/api && uv sync
export ALYR_ENV=local ALYR_DEMO_OPEN=false ALYR_CLIENT_IP_HEADER=x-e2e-address \
       ALYR_PUBLIC_WEB_URL=http://127.0.0.1:3100
uv run python -m alyr.migrate && uv run python -m alyr.seed
uv run uvicorn alyr.main:app --host 127.0.0.1 --port 8000        # leave running

# 2. The web app, built for production (CI does the same), in another terminal
cd apps/web && pnpm install && ALYR_API_URL=http://127.0.0.1:8000 pnpm build
ALYR_API_URL=http://127.0.0.1:8000 pnpm exec next start -p 3100 -H 127.0.0.1   # leave running

# 3. The journeys
cd tests/e2e && pnpm install && pnpm browser
pnpm test                                  # everything, both projects
pnpm exec playwright test --project=phone  # just the phone width
pnpm exec playwright test signup --headed  # watch one
```

Where Windows blocks the API's database driver, run the API in Docker as
`scripts/api-in-docker.sh` does, on a database of your own. Another web address:
`E2E_WEB_URL=http://127.0.0.1:53122 pnpm test` (the web app must have been built with
`ALYR_API_URL` pointing at the API, since Next writes that into its routes at build time).

**Limits.** Sign-in codes are limited to five an hour per email, and every test's visitor address is
its own (see `support/test.ts`), so a single run never meets a limit. A laptop that runs the suite
several times in an hour can: the seeded staff email asks for a code on every run. Give
`E2E_RESET_LIMITS_CMD` a command that empties the two tables on your scratch database, and global
setup runs it first:

```bash
export E2E_RESET_LIMITS_CMD='docker compose exec -T postgres psql -U alyr -d alyr -c "delete from rate_hits; delete from login_codes"'
```

Never point this at a database that holds anything but demo data.

## When one fails

A failed test keeps a screenshot, a trace and a snapshot of the page in `results/`, and the HTML
report in `report/` (CI uploads both as the `e2e-report` artifact). Open a trace with
`pnpm exec playwright show-trace results/<test>/trace.zip`. One retry is allowed in CI so that a
trace of the second attempt exists; **a test that passes only on its retry is reported as flaky and
is a bug in the test or in the product, to be fixed, not ignored.**

## Writing a journey

- Wait for what the user would see, never for a time. No `waitForTimeout`; use the web-first
  assertions (`expect(locator).toBeVisible()`, `toHaveURL`, `expect.poll`) and locators by role
  and name. A page that updates by polling (the test line, a list) is waited for with an assertion.
- Take words from the product's own copy files (`start/copy.ts`, `login/copy.ts`,
  `_customer/order/copy.ts`) so a rewording does not break a journey. The booking page keeps its
  words inline in a component, so `support/customer.ts` repeats them.
- Reach a state by the API where the state is not what is being proved (`support/api.ts`:
  `signUp`, `signIn`, `customerLink`). The customer's first message always goes through the
  simulator channel, never a made-up link.
- Import `test` and `expect` from `support/test.ts` (it gives each test its own visitor address),
  and open other browsers with `visitor(...)`.
- A selector hook (`data-testid`) goes into product code only where no role or label can reach the
  element, in the smallest possible edit. None is needed today.
- Development data only: the fictional demo shop and made-up `.example` addresses.

## What these do not cover

Real WhatsApp (Meta), real email, real payments (the stand-in page and cash on collection are what
run here), a second browser (Firefox, Safari), and anything in production: the post-deploy check
for production is `scripts/smoke-production.sh`, which only reads.
