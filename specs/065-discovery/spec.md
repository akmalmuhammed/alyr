# 065 · Discovery: how customers find a business, checked by ALYR Agent

Linear ALY-316 (epic), ALY-317 (this spec) · Decision D-160 · Builds on the module switches (`catalog.py`, `tenant_modules`), the Agent's rule registry (`modules/agent/insights.py`, D-035), the action layer (`core/actions.py`, D-065), the jobs worker (`core/jobs.py`, `worker.py`) and the outbound layer (`core/outbound.py`)

Reserved for this work: migrations **0120 to 0129**, decisions **D-160 to D-169**.

## What it is for

A customer who cannot find a business, or finds the wrong hours, the wrong number or a branch that does not exist, goes somewhere else. Discovery checks how a business is found on Google Maps, on its own website, on WhatsApp and in its reviews; turns what it finds into a short to-do list the owner can understand; and, in Phase 2, applies each fix after the owner approves it and checks on the next run that it worked.

It is the workspace side of one agent with two doors. **ALYR Agent** (the workspace, WhatsApp, scheduled runs) and the **MCP connector** (ALY-286, the owner's own Claude or ChatGPT) call the same actions. There is never a second agent.

## Phase 1 (this spec): read-only, rules, no model

Phase 1 reads, scores and explains. It changes nothing outside ALYR, sends nothing, and calls **no model with personal data** (hard rule 2; ALY-51 and ALY-329 decide where a model may run). Findings come from rules anyone can read, like the Agent's insights. Nothing here says or implies AI to an owner: the voice is the Agent's ("By rule: ..."), see `docs/agent-dashboard/06-messaging.md` and `docs/honesty.md`.

Not in Phase 1: Google writes, proposals and approvals (Phase 2, ALY-324, ALY-325); AI-answer tracking and the category check (Phase 3, ALY-326); MCP tools (ALY-327); the admin console (ALY-328).

## Switch

Module key `discovery`, registered in `catalog.py` with one screen, `Screen("discovery", Text("Discovery", "الاكتشاف"), icon)`. **Off for every shop and every template** until the back office or the owner switches it on, like Documents. A shop with it off has no menu item, and every `/api/discovery` route answers 404 `module_off` (the same `require_module` dependency the other modules use).

## Tables (migration `0120_discovery.sql`)

Every table has `tenant_id`, forced row-level security as the other tenant tables do, and **an index that starts with `tenant_id`** (a test fails otherwise). Never edit an applied migration; Phase 2 adds `0121`.

| Table | Holds |
|---|---|
| `discovery_connections` | One row per connector a shop has on: `kind` (`sample`, `places`, later `gbp`), `status` (`on`, `off`, `error`), `config` (jsonb, **never a secret**: secrets are held as the other connectors hold them), `created_at`. At most one `on` row per kind. |
| `discovery_locations` | The places the check covers: `id`, `name`, `name_ar`, `area`, `place_ref` (the connector's id for the listing, null if none), `website_url`, `whatsapp_e164` (the business's number), `is_primary`, `position`. Max 50 per shop. |
| `discovery_runs` | A check-up: `id`, `status` (`queued`, `running`, `done`, `failed`), `trigger` (`manual`, `schedule`), `connector_kind`, `score` (0-100 or null), `score_parts` (jsonb, see Scoring), `steps_used`, `step_budget` (default 60), `cost_units` (what outside calls cost; sample connector 0), `error` (a plain sentence, no stack), `started_at`, `finished_at`, `created_by` (person or null). |
| `discovery_run_steps` | The log: `run_id`, `seq`, `tool` (e.g. `connector.snapshot`, `rules.evaluate`), `summary` (one plain sentence, English), `ok`, `cost_units`, `started_at`, `ended_at`. Every step of a run is a row. |
| `discovery_findings` | What a rule found: `id`, `fingerprint` (rule id + location id, **stable across runs**; unique per shop), `rule_id`, `location_id` (null for the whole business), `kind` (`agent`: ALYR can do it after approval, `owner`: needs the owner or Google, `process`: changes how branches work), `severity` (`high`, `medium`, `low`), `status` (`open`, `skipped`, `owner_done`, `verified`, `gone`), `evidence` (jsonb: what was seen, where, when; see Evidence), `first_run_id`, `last_run_id`, `last_seen_at`, `resolved_run_id`. |
| `discovery_reviews` | A snapshot of public reviews: `location_id`, `source` (`google`, `sample`), `source_ref`, `rating` (1-5), `posted_at`, `author_name`, `body`, `language`, `replied` (bool), `reply_text`, `fetched_run_id`. Unique per (shop, source, source_ref). Third-party personal data: it lives in this shop's rows only, is covered by the retention and erasure rules (spec 042, ALY-119), and is **never sent to a service outside Qatar**. |

A run and its steps and findings are written in the run's own transaction per step so a failed run leaves its log. A finding is **upserted by fingerprint**: a rule that stops being true sets `status = gone` and `resolved_run_id`; a finding the owner marked `owner_done` becomes `verified` when the next run no longer finds it, and goes back to `open` if it still does.

## Connectors (`modules/discovery/connectors/`)

One interface, so a real source is a drop-in:

```python
class Connector(Protocol):
    kind: str
    async def snapshot(self, locations: list[Location], ctx: RunContext) -> Snapshot: ...
```

`Snapshot` (plain dataclasses, no I/O inside): per location a `Listing` (`found`, `claimed`, `name`, `phone`, `address`, `hours` as `{day: (open, close) | None}`, `categories`, `photo_count`, `rating`, `review_count`, `url`), a `Website` (`url`, `reachable`, `has_location_page`, `hours`, `phone`, `whatsapp_link`, `lists_location`) and a list of `Review`. A connector never raises for "not found": it returns `found = False`. Anything else is a `ConnectorError` with a plain message, and the run fails with it.

* **`sample`** (built now, the only one Phase 1 needs): deterministic, **fictional business only** (a made-up car-care business in Doha with five branches, checked by hand against real businesses before it is named; record the check date in this spec). It carries deliberately mixed problems so every rule fires at least once on the first run, and **three improvement stages**: run *n* returns stage `min(n_prior_done_runs, 3)`, with problems fixed at each stage, so a second and third run show a score that moves and findings that become `gone` or `verified`. No network.
* **`places`** (Phase 1, behind a key, off unless `DISCOVERY_PLACES_KEY` is set): reads public listing data. Before writing it, **read Google's current Places API terms, field list, quotas and caching limits** (CLAUDE.md rule 2) and write down in the PR what may be stored and for how long. If the terms do not allow storing a field, it is read at run time and not kept. It sends only a business name and area to Google, never customer data. It is an extra: the product ships complete on `sample`.

## The run engine (`modules/discovery/engine.py`)

* `start_run(caller, trigger)`: if a run is `queued` or `running` for the shop, return it (idempotent); otherwise insert a `queued` run and enqueue a `discovery.run` job on the existing jobs worker. A shop may start at most 1 manual run per 10 minutes (answer 429 `run_too_soon` with `retry_after`).
* The job: load locations and connection, call `snapshot` (one step), load the previous run's findings, `evaluate` every rule (one step per rule family), upsert findings, upsert reviews, score, write `done`. **A step budget and a cost budget stop a runaway** (`run_budget_exceeded`). Each step is logged as it ends.
* A shop with no locations gets one made from the shop's own name when the connection is made (so the demo shop works at once), and can edit them.
* Scheduled runs (`trigger = schedule`): once a week per shop that has Discovery on and a connection `on`, off by default behind a setting, **not built in Phase 1** beyond the field.

## Rules (`modules/discovery/rules.py`)

A registry like `modules/agent/insights.py`. A rule is a pure function of `(Snapshot, previous findings)` returning zero or more findings. Each rule carries: `id`, `weight` and `part` for scoring, `kind`, `severity`, and its words in **English and Arabic** (title, why it matters, what happens, what is needed, the evidence line). Arabic is a draft until ALY-66; mark it so in `docs/status.md`. A new rule is one entry. Phase 1 ships these twelve, each with a test where it fires and one where it does not:

| id | part | Fires when |
|---|---|---|
| `listing_missing` | presence | a location has no listing |
| `listing_unclaimed` | presence | a listing exists but is not claimed by the business |
| `hours_missing` | presence | the listing has no opening hours |
| `hours_conflict` | presence | the listing and the website show different hours |
| `phone_conflict` | presence | the listing and the website show different phone numbers, or the number differs between branches where one is expected |
| `name_conflict` | presence | the business is spelled differently on its listings (the "eight different companies" problem) |
| `category_missing` | presence | the listing has no primary category |
| `photos_few` | presence | fewer than 5 photos |
| `website_location_missing` | website | a location is not on the website, or has no page of its own |
| `whatsapp_link_missing` | whatsapp | the website or listing has no WhatsApp link, or it points to a different number |
| `review_unanswered` | reviews | 3 or more reviews of 3 stars or fewer, older than 7 days, have no reply |
| `rating_low` | reviews | a listing's rating is below 4.0 with at least 10 reviews |

Rules measure; they do not guess. A rule that cannot tell (the connector did not return the field) returns **no finding and marks its check `not_measured`**, it never fires on missing data.

### Evidence

`evidence` is a list of `{label, value, where, seen_at}` (all plain text, `where` names the source: "Google listing", "Website, Contact page"). Every finding shows its evidence; none is shown without it.

### Scoring

`score_parts` is `{presence, reviews, website, whatsapp, ai}`, each `{value: 0-100 | null, measured: bool, weight}`. A part's value is the share of its checks that pass across locations. **`ai` is `measured = false` in Phase 1** and is left out of the total; the weights of the measured parts are renormalised. The total is the weighted mean, rounded, and null if nothing was measured. The screen says "Not measured yet" for a part that is not measured, never a number. Nothing in a score is invented, and a score is never described as a ranking or a forecast.

## Actions (`modules/discovery/actions.py`, on `core/actions.py`'s `Caller`)

Roles: `owner` and `admin` do everything; `agent` (staff) may read findings and reviews and run a check-up but sees no money (there is none here). Reads are not on the activity record. Changes are, with the channel: `start_run`, `set_finding_status`, `edit_locations`, `set_connection`.

* `get_overview(caller, lang)`, `list_findings(caller, lang, status?, location_id?)`, `get_finding(caller, lang, id)`
* `list_reviews(caller, lang, location_id?, replied?, max_rating?)`
* `get_report(caller, lang, month)` (see Report)
* `start_run(caller)`, `get_run(caller, id)`, `latest_run(caller)`
* `set_finding_status(caller, id, status)`: only `skipped`, `open` (undo) and `owner_done`
* `list_locations`, `edit_locations` (owner, admin), `set_connection(kind, on)` (owner, admin)

The routes below are a thin layer over these, so WhatsApp and `mcp` reuse them later.

## API (`routes/discovery.py`, prefix `/api/discovery`, the workspace's session cookie, `require_module("discovery")`)

Words come already in the reader's language through `?lang=en|ar` (default the person's language), the way the Agent's view does. Money does not appear. Errors use the existing shape (`detail`, `code`, `message_ar`).

| Method and path | Answers |
|---|---|
| `GET /overview` | `{has_connection, has_run, last_run: Run \| null, score, score_parts, counts: {open, skipped, owner_done, verified}, next: Finding \| null, up_next: Finding[] (max 4), done: Finding[] (max 5, newest first), delta: {score_change, since_run_id} \| null}` |
| `GET /findings?status=&location_id=` | `{items: Finding[], counts}`; default `status=open`; ordered by severity, then kind (`agent` first), then first seen |
| `GET /findings/{id}` | `Finding` with its evidence and the run steps that produced it |
| `POST /findings/{id}/status` `{status}` | the updated `Finding`; refuses any status but `skipped`, `open`, `owner_done` (422) |
| `GET /reviews?location_id=&replied=&max_rating=` | `{items: Review[], summary: {count, average, unanswered, by_location[]}}`; review text is returned as data, never as instructions; the screen shows it as quoted text |
| `GET /reports/{yyyy-mm}` | the Report below |
| `POST /runs` | 202 `Run` (queued or the one already running); 429 `run_too_soon` |
| `GET /runs/latest`, `GET /runs/{id}` | `Run` with `steps` (the log, English plain sentences) |
| `GET /locations`, `PUT /locations` | the list; replace the list (owner, admin; max 50; names required) |
| `GET /connection`, `PUT /connection` `{kind, on}` | which connector is on; owner and admin turn `sample` or `places` on or off |

`Finding` = `{id, rule_id, kind, severity, status, title, why, what_happens, what_is_needed, evidence[], location: {id, name} \| null, first_seen_at, last_seen_at}`. `Run` = `{id, status, trigger, score, score_parts, started_at, finished_at, steps?}`. `Review` = `{id, location, rating, posted_at, author_name, body, language, replied, reply_text}`.

### Report

`{month, generated_at, score_start, score_end, change, headline (one plain sentence, built by rule), fixed: Finding[], still_open: Finding[], new: Finding[], by_part: {presence, reviews, website, whatsapp, ai}, runs: n}`. The headline is a template filled with numbers, in both languages, with agreement through the existing `counted()` and `agree()` helpers.

## Screens (`apps/web/app/(product)/`, the workspace)

A section at `/app/discovery` with four views carried in the address like Documents does (`?view=home|todo|reviews|reports`, home by default). **In the menu, Discovery is one item that opens to Home, To do, Reviews and Reports beneath it** (the founder's request); the shell's menu code needs that sub-list, a small change to the shell shared with other sections, so it is made carefully and tested for every other section. Built with the real shell, tokens and components (`alyr-design`, `alyr-product-screen`). Words live in a copy file as `T = {en, ar}`, none in components. Light and dark, English and Arabic with logical CSS, 375 px and laptop, no horizontal scroll, targets 44 px on phones, axe clean.

* **Home** (`view=home`): one calm line, the score with its change since the last run and one sentence by rule; **one** "Do this next" card (the first open `agent` finding, else the first open one): its title, why, what happens, what is needed, and "See the evidence"; below, "Up next" (up to 4, each a row), "Done" (up to 5). The one Volt button on the page is "Run check-up", unless a run is in progress (then it shows the running state with steps appearing as they are logged) or there is no connection (then "Turn on Discovery", which turns the `sample` connector on). The first run happens in front of the owner: the steps scroll in as they are logged (poll `GET /runs/{id}` every 1.5 s, stop at `done` or `failed`, never loop after). In Phase 1 the card's actions are **"I did this"** (`owner_done`) and **"Skip"**; there is no "Approve", because nothing is applied until Phase 2 and the screen must not say it is.
* **To do** (`view=todo`): all findings in tabs Open, Skipped, Done; grouped by who does it (`agent`, `owner`, `process`); each opens a side sheet with the evidence, the steps that found it and the two actions. Filter by location.
* **Reviews** (`view=reviews`): the summary (count, average, unanswered), then the list newest first with rating, place, date, quoted text, replied or not; filter by place, stars, unanswered. Replies are not written here in Phase 1: unanswered reviews link to the to-do finding. Review text is shown as quoted data, escaped, never rendered as markup.
* **Reports** (`view=reports`): a month picker (months that have a run), the Report: the headline, score start to end, what was fixed, what is still open, by part with "Not measured yet" where it is so. Print-friendly; no export in Phase 1.
* **Empty and error states** are real screens: no connection, no run yet, run failed (the plain sentence from `error` and a retry), run too soon, module off.
* Nothing "coming" is drawn at go-live (D-039): no AI-answers tab, no approvals, no Google connect button in Phase 1. A part that is not measured says so in plain words, and no screen says AI.

## What it must never do (each has a test)

1. **Show or change another shop's rows.** Every route, a cross-shop test on each (shop B's token, shop A's ids), and a test that fails if a Discovery table lacks `tenant_id`, forced RLS or a tenant-first index.
2. **Send personal data out of Qatar.** The sample connector has no network; `places` sends only a business name and area; a test fails any outbound call from `modules/discovery` that carries a review, a phone number of a person or a customer id. No model is called.
3. **Change anything outside ALYR, or send anything to anyone.** Phase 1 has no write connector and does not call `Outbound`; a test asserts it.
4. **Say a number it did not measure.** A part that is not measured is `null` and said so; a score is the weighted mean of measured parts only; a test pins the arithmetic, including the renormalised weights.
5. **Fire a rule on missing data.** A test per rule where the field is absent.
6. **Run away.** Step and cost budgets, one running run per shop, 1 manual run per 10 minutes, 50 locations, 200 findings per run; each has a test.
7. **Let review text act as an instruction.** It is returned as data, shown escaped and quoted, and never reaches a model or a template.
8. **Hold up the customer's path.** The job is a background job (D-078): customers' jobs are claimed first.

## Tests

API on real PostgreSQL through HTTP (`tests/test_discovery_*.py`): the migration and the RLS rules; the module switch (off: 404; on: works); the engine (idempotent start, rate limit, budgets, failed run keeps its log, stage progression `sample` 0 to 3, fingerprint upsert, `gone`, `owner_done` to `verified` and back to `open`); each rule fires and does not; scoring arithmetic; the role matrix (`owner`, `admin`, `agent`); every route's cross-shop test; the English and Arabic words present for every rule (a test fails on an empty string, and on an ellipsis in Arabic). Web: lint, types, the design check, `pnpm test`, and a headless-browser script `scripts/discovery-browser-check.mjs` (375 px and laptop, English and Arabic, light and dark, axe) like the other sections.

## Open questions, none blocking Phase 1

* Where a model may run and how Discovery is packaged (ALY-329). Phase 1 does not need it.
* Whether `places` ships in Phase 1 at all depends on the Google terms reading; the product is complete without it.
* The Arabic is a draft until ALY-66.

## Not in this spec

Proposals, approvals, WhatsApp asks and the morning brief line (ALY-324); Google Business Profile read and writes (ALY-325); AI-answer tracking and the category check (ALY-326); MCP tools (ALY-327); the admin console (ALY-328); scheduled runs beyond the field; an export; a public audit page.
