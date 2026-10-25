# The client portal demo (sample data, no backend)

Written 25 Oct 2026 (ALY-246, D-057). The real workspace and sign-up screens, published as plain files with recorded sample data. There is no API, no database and no secret behind it.

## What is in it, and what is not

| In | Not in |
|---|---|
| `/` a landing page: pick a shop, or start a sign-up | The customer pages (`/s`, `/b`, `/t`, `/d`, `/pay`) |
| `/app` the workspace of three fictional shops: Qirfa Bakery (orders, bookings, chat, accounts), Lumi Salon & Spa (bookings, services, catalog), Rawda Trading (wholesale, catalog, credit) | The back office (`/ops`), the WhatsApp simulator, the public site |
| `/start` a scripted sign-up of a barber shop: account, code, business, services, hours, a test chat, the plan, go-live | Anything that saves: a change answers "This is a demo, so that change was not saved." |

Reads that were not recorded answer "This part is not in the demo." Search boxes and filters that ask the server show the list as recorded.

## How it works

- `scripts/build-portal-demo.sh` copies `apps/web` to `apps/web/.demo-stage`, keeps only the workspace and sign-up routes, and builds a static export with `NEXT_PUBLIC_ALYR_DEMO=1`. Result: `apps/web/out-demo` (about 5 MB).
- `apps/web/app/(product)/_demo/` is the demo layer. `shim.ts` answers `/api/*` from `apps/web/demo/<shop>.json`; `signup.ts` plays the sign-up from `apps/web/demo/onboarding.json`; `DemoMode.tsx` puts the strip on every page; `Landing.tsx` is the first page. In a normal build none of it does anything.
- Shop pictures are copied to `/api/media/file/...` as files, because a picture is loaded by the page, not by `fetch`.
- `apps/web/wrangler.demo.jsonc` is the Worker `alyr-portal-demo`: static assets only.

## Refresh the recordings

The recordings are a snapshot. Redo them after the screens or the demo shops change.

1. `scripts/cloud-setup.sh` (or `docker compose up -d`), then from `apps/api`: `uv run python -m alyr.seed_bookings`, `alyr.seed_qirfa`, `alyr.seed_catalog_demos`.
2. Start the API (`ALYR_ENV=local`) and `pnpm dev` in `apps/web`.
3. Point `PLAYWRIGHT_DIR` at an install of Playwright (it is not a dependency of the repo) and run, from the repo root:
   `node scripts/demo-portal/record.mjs qirfa huda@qirfa.example`
   `node scripts/demo-portal/record.mjs salon owner@demo-salon.example`
   `node scripts/demo-portal/record.mjs wholesale owner@demo-wholesale.example`
   `node scripts/demo-portal/record-onboarding.mjs`
   A recording of a shop takes about ten minutes (it opens every tab). `SKIP_CRAWL=1` keeps an earlier recording and only adds the detail answers.
4. Look at the files before committing: they must hold only the fictional shops.

## Build and look

```
scripts/build-portal-demo.sh
cd apps/web/out-demo && python3 -m http.server 4100    # then open http://localhost:4100
```

## Publish (the founder says yes first)

From `apps/web`, after `scripts/build-portal-demo.sh`:

```
pnpm exec wrangler deploy --config wrangler.demo.jsonc
```

The first deploy creates the Worker and prints its `alyr-portal-demo.<account>.workers.dev` address. A custom domain (for example `demo.alyr.qa`) is a DNS change and needs the founder's yes. The laptop asks him to approve a production deploy.

**Roll back:** `pnpm exec wrangler rollback --config wrangler.demo.jsonc`, or delete the Worker (`pnpm exec wrangler delete --config wrangler.demo.jsonc`): nothing else depends on it.

## Never

- Never record from a real shop or put real people, numbers or amounts in `apps/web/demo/`. The repository is public while it is open.
- Never describe it as the live service. The strip says Demo on every page.
