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

## Checks per place (ALY-333, an addition; nothing above changes)

A check-up works out, for every rule and every place it looks at, one of `pass`, `fail` or `not_measured`, and makes the score from that. Until this addition it kept only the fails (as findings) and the score, so a screen could not set every place against every check: a check with no finding might have passed, or might not have been measured.

**Kept.** Migration `0125_discovery_checks.sql` adds `discovery_runs.checks` (jsonb, null for every run made before it): a list of `{rule, location, state}`, `location` a place's id or null for a rule about the whole business. It is written in the same statement as the score, from the same rule outcomes, and never changed afterwards. The Answers check (spec 068) is not a rule: its answers are kept in `discovery_answers` and are not in this list. No new table: the run's row-level security, grants, erasure rule and place in the owner's download are the run's.

**Asked.** `GET /api/discovery/checks?lang=en|ar`, the workspace's session cookie, module on, every role (it is a read, like findings; it is not on the activity record).

```json
{
  "run_id": "…", "finished_at": "2026-11-08T19:14:09+00:00", "measured": true,
  "rules": [{"id": "listing_missing", "part": "presence", "label": "On Google Maps"}],
  "places": [{"id": "…", "name": "Nuqta Car Care - Lusail",
              "checks": {"listing_missing": "pass", "hours_conflict": "fail", "rating_low": "not_measured"},
              "fixed": ["hours_missing"], "passed": 8, "failed": 2, "not_measured": 1}],
  "business": {"checks": {"name_conflict": "fail"}, "fixed": [], "passed": 0, "failed": 1, "not_measured": 0}
}
```

* `rules` is the registry in its order, always all of it, each with a label of a few words that says what passing looks like, in the reader's language (`words.CHECK_NAMES`; Arabic a draft until ALY-66).
* The answer is of the **last finished check-up**. `places` are the shop's places as they are now, in their order; a place added since has no checks, a place removed since is not listed.
* `checks` holds only the rules that looked at that row; a rule is about places or about the whole business (`business`, null when no such rule ran), never both.
* `fixed` names the rules that were `fail` in the finished check-up before this one and are `pass` now. With no earlier check-up, or one made before the column, it is empty.
* `measured` is false, with no places, when there is no finished check-up or the last one was made before the column. **Never a guess:** the API does not work an old run's outcomes back from its findings, and a rule or a state it does not know in the column is left out.
* There is no score per place. The spec has one score, and a score is not a ranking.

**Tests** (`tests/test_discovery_checks.py`, real PostgreSQL through HTTP): the shape and the order; every rule present; the fails are exactly the open findings; the kept outcomes scored again give the run's score (with the Answers check off, as it is by default); `fixed` across two sample check-ups; a run with a null or unknown column is not measured; both languages; every role reads and nothing is recorded; module off; another shop's rows.

**Not in this addition:** the screen (the matrix on Home, which builds on ALY-332).

## Open questions, none blocking Phase 1

* Where a model may run and how Discovery is packaged (ALY-329). Phase 1 does not need it.
* Whether `places` ships in Phase 1 at all depends on the Google terms reading; the product is complete without it.
* The Arabic is a draft until ALY-66.

## Not in this spec

Proposals, approvals, WhatsApp asks and the morning brief line (ALY-324); Google Business Profile read and writes (ALY-325); AI-answer tracking and the category check (ALY-326); MCP tools (ALY-327); the admin console (ALY-328); scheduled runs beyond the field; an export; a public audit page.

## As built (Phase 1 backend, ALY-318 to ALY-321, branch `aly-318-discovery-api`)

What is built: migration `0120_discovery.sql` (the six tables), the `discovery` module
(`modules/discovery/`: `connectors/`, `engine.py`, `rules.py`, `scoring.py`, `actions.py`, `words.py`,
`errors.py`), `routes/discovery.py`, the `discovery.run` job on the existing worker, the `sample`
connector, and `python -m alyr.discovery_demo`. The routes and their shapes are the ones in "API" above;
everything below is where the build chose, added or differs. **The shapes of the spec are kept; every
addition is a new key, never a changed one.**

### Deviations and choices

1. **Module off answers 404 `module_off`, with its own dependency** (`routes/discovery.module_on`), not
   `require_module("discovery")`, because `require_module` answers 403 and this spec says 404. The error
   body is the Documents shape: `{detail, code, message_ar, ...}`. `forbidden` (403) is a role refusal.
2. **`places` is not built, and nothing stands in for it** (no placeholder, no `DISCOVERY_PLACES_KEY`).
   Google's Places API policies (read 8 Nov 2026,
   `developers.google.com/maps/documentation/places/web-service/policies`) allow a place ID to be kept
   indefinitely and latitude and longitude for at most 30 consecutive days, and say the rest of Google
   Maps content (names, addresses, user reviews, ratings, photos) is not to be copied or saved unless
   the service terms expressly permit it. Phase 1's design keeps what a listing showed (as evidence) and
   review text (as `discovery_reviews`), so a Google source cannot ship as specified. It also needs a
   Google Cloud key with billing, which is the founder's. Needs: the lawyer (ALY-51), or a design that
   stores place IDs only and reads the rest at run time, and a key. The product is complete on `sample`.
3. **The sample business is "Nuqta Car Care" (Arabic: نقطة لعناية السيارات)**, five fictional branches in
   Doha (West Bay, Al Wakra, Lusail, Al Sadd, Industrial Area). **Checked 7 Nov 2026 by web search only:**
   the name with Doha, car care, car wash, detailing and Qatar found no business of that name, and
   "Nuqta" alone found no company in Qatar (only unrelated ones in Libya, the UAE and Kuwait). A first
   candidate, "Tarfa", was dropped because Al Tarfa is a real district of Doha. Google Maps, Instagram and
   the trademark register were NOT checked: they are the founder's before the name is shown outside ALYR.
   Phone numbers are in the 5555 01xx range and web addresses end in `.example`. It does not resemble Auto
   Fast Track or any prospect.
4. **The sample turns on with its five branches.** The spec says a shop with no places gets one made from
   the shop's own name; for `sample` the five fictional branches are made instead (one place could not
   make every rule fire). Any other connector would get one place from the shop's name. A shop that
   already has places keeps them; the sample maps them to its branches by `place_ref` (`sample:<key>`),
   else by position, and a place past the fifth is "not found".
5. **One connector is on at a time.** Turning one on turns the others off (the table allows one `on` row
   per kind; this keeps a real source from mixing with the fictional one). `PUT /connection` and `GET
   /connection` answer `{kind, status, available, connections: [{kind, status, created_at}]}`;
   `available` is `["sample"]`.
6. **Scoring weights.** A part's value is the share of its checks that pass, each check counting its rule's
   `weight` (listing_missing 3; listing_unclaimed, hours_missing, hours_conflict, phone_conflict,
   website_location_missing, whatsapp_link_missing, review_unanswered, rating_low 2; the rest 1). Parts
   are worth presence 40, reviews 25, website 15, whatsapp 10, ai 10 before the unmeasured ones are left
   out and the rest renormalised. Exact fractions, rounded half up (`scoring.py`, pinned by tests).
7. **Which rule is which kind and severity** (the spec left it open): `agent` (ALYR could do it after
   approval, Phase 2): hours_missing (high), hours_conflict, phone_conflict (high), category_missing;
   `owner`: listing_missing (high), listing_unclaimed (high), photos_few (low), website_location_missing,
   whatsapp_link_missing, review_unanswered; `process`: name_conflict, rating_low. Unmarked ones are
   medium.
8. **`phone_conflict`** is the listing against the website's number, per place. "Differs between branches
   where one is expected" is read as the same check (a branch whose listing differs from the number the
   website shows for it); no number is guessed as the expected one. `rating_low` is `not_measured` under
   10 reviews. `whatsapp_link_missing` compares the link's number with the place's `whatsapp_e164` when it
   has one (without it, it asks only for a link); the listing's own link is `None` (not measured) for a
   real source and for the sample.
9. **Findings.** `GET /findings?status=` also accepts `done` (owner_done, verified and gone) and `all`;
   `counts` has a fifth key, `gone`. The overview's `done` list is those three statuses, newest change
   first. A finding closed by a run can be neither skipped nor marked done (409 `finding_closed`). A rule
   that is `not_measured` in a run leaves its finding exactly as it was (never closed on missing data).
   `Finding` also carries `rule` (the rule in one plain sentence); `GET /findings/{id}` adds `run_id` and
   `steps` (the snapshot step and the rule family's step of the run that last saw it).
10. **Runs.** `Run` also carries `connector`, `error` (a plain sentence in the reader's language),
    `error_code`, `steps_used`, `step_budget` and `created_at`. `GET /runs/latest` answers `null` when there
    is no run. Steps: `connector.snapshot`, `rules.presence`, `rules.reviews`, `rules.website`,
    `rules.whatsapp`, `findings.save`, `reviews.save`, `score.compute`. The cost budget is 100 units and the
    step budget 60 (written on the run); 200 findings in one run stops it (`too_many_findings`). A run
    queued or running for 15 minutes is ended by the next start (`run_interrupted`). The ten minutes
    between manual runs is `ALYR_DISCOVERY_RUN_GAP_SECONDS` (600); 429 carries `retry_after` and the header.
    **In local development jobs run inside the API, so a check-up is already `done` when `POST /runs` has
    answered; in production the worker runs it a moment later.** A screen must poll either way.
11. **Locations.** `GET` and `PUT /locations` use `{items: Location[]}` both ways. `PUT` replaces the list:
    entries with an `id` of this shop are changed, entries without are added, entries left out are
    removed with their findings and reviews. At least 1, at most 50 (422 `too_many_locations`), a name
    each, `website_url` http(s) only, `whatsapp_e164` as `+` and 7 to 15 digits. Refused while a run is
    queued or running (409 `run_in_progress`).
12. **Reviews.** `summary` counts all the shop's reviews (the filters change the list, not the summary);
    `unanswered` is every review with no reply, of any stars; the list is the newest 200.
13. **Report.** The month is the shop's own (its time zone). `score_start` and `score_end` are the first and
    last done run of the month, `change` is null with fewer than two runs, `new` are findings first seen
    in a run of the month, `fixed` are findings closed by a run of the month, `still_open` are those not
    closed by the month's last run. A month with no run answers `runs: 0` and empty lists.
14. **The default language** is the business's own (`tenants.owner_lang`), since a person has none.
15. **Overview** also carries `headline`, one sentence by rule in the reader's language.
16. **Switching it on.** Discovery is in no product, so there is no price and no switch on the Products
    screen; the back office switches it for one business (`SWITCHABLE_MODULES`, `/ops`), and on a developer's
    machine `uv run python -m alyr.discovery_demo [--tenant ID] [--off]` switches it on and turns the sample
    on (local only). Seeds are untouched.
17. **Activity.** The record's subject list learned `discovery` (read from the constraint as it stands, so a
    parallel branch's subjects are kept). Changes record `run.start`, `finding.status`, `locations.edit`,
    `connection.on` and `connection.off` with the channel.
18. **Added columns** beyond the spec: `discovery_runs.error_ar`, `error_code`, `cost_budget`, `created_at`;
    `discovery_findings.updated_at`; `discovery_connections.updated_at`. `discovery_connections.status`
    defaults to `on`.
19. **Erasure** (`core/erase_rules.py`): all six tables are deleted with the business. They are in the
    account download automatically (it reads every table with a `tenant_id`).

### Not built in Phase 1 (as specified)

Scheduled runs (only the `schedule` value of `trigger` exists), `places`, Google writes, proposals and
approvals, the MCP tools, the admin console, the web screens (another session), a WhatsApp command.
