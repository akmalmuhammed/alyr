# 066 · Discovery, Phase 2: proposals, approvals, owner asks on WhatsApp

Linear ALY-324 (this work), ALY-325 (Google Business Profile, interface only here) · Decision D-166 · Builds on spec 065 (Discovery Phase 1, merged: backend PR #269, screens PR #268), the action layer (`core/actions.py`, D-065), the outbound layer (`core/outbound.py`, D-004, D-020), the templates (`core/templates.py`), the owner's WhatsApp commands (`modules/owner/`, `core/staff_link.py`), the jobs worker (`core/jobs.py`, `worker.py`) and the Agent (`modules/agent/`, D-035).

Reserved for Discovery: migrations **0121 to 0129** (this spec uses 0121, 0122 and 0123), decisions **D-160 to D-169** (this spec takes D-166; D-165 is taken by the homepage work in PR #281).

**Status of this document: the contract. Nothing in it is built.** Backend and screens are built in parallel against it. Where the build must differ, change this spec first, in the same pull request as the change, and say so. Words in English are final; Arabic is a draft until ALY-66.

## What it is for

Phase 1 finds what is wrong with how customers find a business, and tells the owner. The owner then fixes it somewhere else and taps "I did this". Phase 2 closes the loop: for the fixes ALYR can do, ALYR prepares the exact change, the owner approves it with one tap (in the workspace or on WhatsApp), ALYR applies it, and the next check-up checks that it worked. The owner can undo it where the source allows.

**The guarantee, which every part of this spec protects: nothing outside ALYR is changed, and nothing is sent to anyone but the owner's own team, without a person's tap on that exact change.** Phase 1 had no Approve button and the screens said so. Phase 2 removes that limit, and keeps the guarantee.

## Words used in this spec (and in the code)

| Word | Means | Not to be confused with |
|---|---|---|
| **proposal** | one exact change to one place's public presence, with its before and after, waiting for a person | a finding (what was found) or a suggestion (the Agent's cards) |
| **fact** | something the owner has confirmed to be true about a place (its real opening hours, phone, category, name, WhatsApp number): the only source a proposal's "after" may come from | a finding's evidence (what was seen on Google or the website) |
| **target** | where the change is made: `listing` (the Google listing, through a connector) or `website` (the business's own site) | the connector kind |
| **ask** | one WhatsApp message to one person about one proposal | the proposal's state, which an ask never holds |
| **staff role** | a team member whose membership role is `agent` (staff, sees no money) | the **agent door**: ALYR Agent or the owner's own AI through the MCP connector (ALY-327), which may propose and never approve |
| **branch manager** | a staff-role member the owner or an admin has linked to one or more places (`discovery_location_managers`) | the Catalog's "manager" numbers (`contacts.catalog_manager`), which are a different thing and get nothing from this spec |

Owner-facing English calls a proposal "a change" ("a change is waiting for your approval") and the area "Proposals" / «التعديلات المقترحة». The code says `proposal`.

## Build order (phases, no dates)

Each phase is finished when its demo works on the sample business in the simulator.

1. **A. Proposals and facts.** Migration 0121, the builder rules, the actions and routes to prepare, list, approve, decline. Demo: run a check-up, see a proposal for Al Sadd's missing hours, approve it, see it `approved`.
2. **B. Apply, undo, verify.** The connector write interface, the sample connector's writes, the `discovery.apply` job, the verification step. Migration 0123. Demo: approve, run the check-up again, the finding is `verified` and the score is higher.
3. **C. Asks on WhatsApp.** Migration 0122, the ask message (inside the window as buttons; outside it as a template, held until Meta approves), reply handling, caps, quiet hours, opt-out. Demo in the simulator: the owner's linked number gets the ask, taps Approve, the workspace shows the same state.
4. **D. The Agent and the brief hook.** The "Needs you now" item and `brief_line`.
5. **E. Screens.** Can start as soon as A's shapes are fixed (this spec fixes them); finish against the real API after B.

## Proposals

### Which rules have a proposal

A proposal is made by a rule from a finding. It is never written by a person's free text and never by a model.

| Rule (spec 065) | Proposal type | Field | Target | The "after" comes from | Notes |
|---|---|---|---|---|---|
| `hours_missing` | `set_hours` | `hours` | `listing` | fact `hours` | |
| `hours_conflict` | `set_hours` | `hours` | one proposal for each of `listing` and `website` whose hours differ from the fact | fact `hours` | |
| `phone_conflict` | `set_phone` | `phone` | each of `listing` and `website` whose number differs from the fact | fact `phone` | compared by digits |
| `category_missing` | `set_category` | `category` | `listing` | fact `category` | |
| `name_conflict` | `set_name` | `name` | `listing`, for each place whose listing spells it differently from the fact | fact `name` | the fact defaults to the place's own name |
| `whatsapp_link_missing` | `add_whatsapp_link` | `whatsapp_link` | `website` | fact `whatsapp` (defaults to the place's `whatsapp_e164`) | after = `https://wa.me/<digits>`; also fixes a link that points at another number |
| `review_unanswered` | `reply_to_review` | `review_reply` | `listing` (the review) | a fixed reply template chosen by rule | see "Review replies" |
| `listing_missing`, `listing_unclaimed`, `photos_few`, `website_location_missing`, `rating_low` | none | | | | need the owner, Google or a change of process; the finding stays as in Phase 1, with "I did this" |

A proposal is made only when **all** of these hold, and the builder says which one failed (to the log, not to the owner):

1. the finding is `open` (not skipped, done or closed) and its place exists;
2. the active connection's connector can write this `(target, field)` (`writes`, below). If it cannot, no proposal is made and the finding keeps its Phase 1 `kind`;
3. the fact the "after" needs exists and is **confirmed** (below). If not, there is no proposal and the finding carries `needs_fact: {key, location_id}`, which the screens turn into a form;
4. the listing is `found` and the field was **measured** in the snapshot (a `None` is "not measured": no proposal on it);
5. no live proposal (`proposed` or `approved`) with the same `(finding, type, target, subject_ref)` exists (the database's partial unique index);
6. no proposal with the same `change_hash` was declined, expired by time or undone in the last 14 days, or applied and then not confirmed by the next check-up (the cool-off: ALYR does not keep asking for what was refused);
7. the shop has fewer than 50 live proposals and the run has made fewer than 25.

**A finding's `kind` becomes honest.** Phase 1 stored `kind` from the rule. In Phase 2 a finding's effective `kind` is `agent` only while rule 2 holds for its rule (the connector can write it); otherwise the rule's own Phase 1 kind. The engine refreshes `kind` on every upsert. Consequence for the sample connector, which writes everything it measures: `name_conflict`, `whatsapp_link_missing` and `review_unanswered` become `agent` (they were `process`, `owner`, `owner`).

### Facts (what makes an "after" true)

ALYR does not guess what the real opening hours are. The "after" of a proposal comes only from a **fact**: something a person confirmed. This is what keeps the product rule-based and honest, and it is what the owner is being asked to approve.

Table `discovery_facts`, one row per `(place, key)`; keys `hours`, `phone`, `category`, `name`, `whatsapp`.

| Key | Value shape (jsonb) | Validation |
|---|---|---|
| `hours` | `{"sat": ["07:00","22:00"], "fri": ["13:00","22:00"], "sun": null, ...}`: all seven days present; `null` is closed | `HH:MM` 24-hour; close after open; no overnight shifts in Phase 2 (422 `bad_hours`) |
| `phone` | `{"phone": "+97455550112"}` | `+` and 7 to 15 digits (422 `bad_phone`) |
| `category` | `{"category": "Car wash"}` | 1 to 80 characters |
| `name` | `{"name": "Nuqta Car Care - Al Wakra"}` | 1 to 160 characters |
| `whatsapp` | `{"phone": "+97455550150"}` | as `phone` |

`source` is `owner` (typed in the workspace by someone allowed), `sample` (the fictional business's own truth, written when the sample is turned on) or `places` (never a row: the **default** for `name` and `whatsapp`, read from `discovery_locations.name` and `whatsapp_e164`, which the owner typed). A row with source `owner` needs `confirmed_by`. `facts.effective(location, key)` returns the row, else the default, else nothing. Nothing else is a fact: not a finding's evidence, not a value read from Google or the website (they are what is **wrong**).

Prefilling hours from Bookings' opening hours is **not in this spec** (the person would still have to confirm it; it is a good next step).

### Review replies

The text is chosen by rule from a table in `proposal_words.py`, in English and Arabic, whole templates, no model, and **no word of the review is ever copied into the reply, an ask or a template value** (a review is third-party text and is data only). Chosen by the review's `rating` and `language` (`ar` gets Arabic; anything else gets English):

| Stars | English (the exact text) |
|---|---|
| 1 or 2 | "Thank you for telling us. We are sorry the visit did not go as it should have. Please contact {contact} so the team can put it right." |
| 3 | "Thank you for your feedback. We want every visit to be better than this one. Please contact {contact} and tell the team how." |

`{contact}` is "us on WhatsApp at +974 5555 0150" when the place has `whatsapp_e164`, else "the branch". Arabic equivalents are written whole in `proposal_words.py` (draft until ALY-66). Every reply text is at most 240 characters (a test). One proposal per unanswered review, oldest first, at most 3 live per finding. The reply is in **the shop's own voice** (it is a public answer the owner approved, so "us" and "the team" are the shop's), not ALYR's: the no-first-person rule is about ALYR's own words to the owner. The owner cannot edit the text in Phase 2 (free text is the one thing that would need review and a model; it is not in this spec).

### Fields of a proposal

Table `discovery_proposals` (migration 0121). Every column below exists; `change` and its siblings are **immutable after insert** (a trigger refuses their update), so what the owner saw is what is applied.

| Column | Meaning |
|---|---|
| `id`, `tenant_id` | |
| `finding_id` | the finding it comes from; on delete cascade |
| `location_id` | not null: always one place (a whole-business finding gets one proposal per place); on delete cascade |
| `type` | `set_hours`, `set_phone`, `set_category`, `set_name`, `add_whatsapp_link`, `reply_to_review` |
| `target` | `listing` or `website` |
| `connector_kind` | the connector it will be applied through: `sample` or `gbp` |
| `subject_ref` | `''`, or the review's `source_ref` for a reply |
| `change` | `{"field": "hours", "before": ..., "after": ...}`, plain values, never words (shapes below) |
| `change_hash` | hex SHA-256 of the canonical JSON (sorted keys, no spaces, UTF-8) of `{type, target, location_id, subject_ref, field, after}`: the same intended change always has the same hash; `before` is left out on purpose (the live value may shift) |
| `severity` | copied from the finding |
| `status` | `proposed`, `approved`, `declined`, `expired`, `applied`, `failed`, `undone` |
| `proposer_kind` | `engine` (a check-up made it) or `agent` (the agent door, later); `proposed_by` is the person the door acted for, null for the engine |
| `run_id` | the check-up that made it, null for one prepared by hand |
| `proposed_at`, `expires_at` | `expires_at = proposed_at + 14 days` |
| `decided_by`, `decided_channel` (`portal` or `whatsapp`), `decided_at` | who approved or declined, and where |
| `expire_reason` | `time`, `finding_gone`, `finding_done`, `finding_skipped`, `superseded` |
| `apply_attempts`, `apply_started_at` | |
| `applied_at`, `receipt` | `receipt` is `{ref, at}` from the connector: public facts only, never a token |
| `undo_until`, `undone_by`, `undone_at` | |
| `failure_code` | a key of the failure words (below) |
| `verification` | null; `pending` once applied; `confirmed` or `not_confirmed` after the next check-up |
| `verified_run_id` | |
| `updated_at` | |

`change` shapes (all `before`/`after` values are plain and are shown by the one function `change_lines(change, lang)` that both the workspace and WhatsApp call, so the two cannot disagree):

| Field | `before` / `after` |
|---|---|
| `hours` | `{"sat": ["07:00","22:00"], "fri": ["13:00","22:00"], "sun": null, ...}`; `before` may be `{}` (no hours shown) |
| `phone` | `{"phone": "+97455550129"}` (as the surface shows it); `after` is the fact |
| `category` | `{"category": ""}` / `{"category": "Car wash"}` |
| `name` | `{"name": "Nuqta Car Wash - Wakra"}` / `{"name": "Nuqta Car Care - Wakra"}` |
| `whatsapp_link` | `{"url": ""}` or the wrong link / `{"url": "https://wa.me/97455550150"}` |
| `review_reply` | `{"reply": ""}` / `{"reply": "<the template text>", "template": "reply_low_en"}` |

`change_lines(change, lang)` answers `{"field_label", "where", "before": {"text", "lines"}, "after": {"text", "lines"}}`. `text` is one line (what WhatsApp and the table cell show). `lines` is, for hours only, seven `{day, text}` rows in the week order Sat, Sun, Mon, Tue, Wed, Thu, Fri (what the sheet shows). Hours text groups consecutive days with the same hours: English "Sat to Thu 07:00 to 22:00; Fri 13:00 to 22:00", Arabic «السبت إلى الخميس 07:00 إلى 22:00؛ الجمعة 13:00 إلى 22:00»; closed days "Fri closed" / «الجمعة مغلق»; none "none" / «لا شيء». Digits are Western everywhere.

### States

```
              approve                 apply job: ok
 proposed ───────────────► approved ─────────────────► applied ──undo (inside the window)──► undone
    │  │                      │  ▲                        
    │  └─ decline ─► declined │  └── approve again (retry, at most 3 attempts) ──┐
    └──── expire ───► expired └── apply job: error ──► failed ──decline──► declined
```

| From | To | By | Rules |
|---|---|---|---|
| none | `proposed` | the check-up's `proposals.build` step, or `prepare` by hand | the conditions above |
| `proposed` | `approved` | `approve`: owner, admin, or the branch manager of that place; channel `portal` or `whatsapp` only | not expired; `change_hash` matches; enqueues `discovery.apply` in the same transaction |
| `proposed` | `declined` | `decline`: owner, admin, or the branch manager of that place | starts the 14-day cool-off |
| `proposed` | `expired` | the sweep (`time`), or a check-up that finds the finding `gone` (`finding_gone`), or the owner marking it done (`finding_done`), or skipping it (`finding_skipped`), or the engine replacing it (`superseded`) | only `time` starts a cool-off |
| `approved` | `applied` | the apply job | the connector accepted the write |
| `approved` | `failed` | the apply job | `failure_code` set; nothing was changed unless the code says otherwise |
| `failed` | `approved` | `approve` again | at most 3 attempts in all (`retry_limit`) |
| `failed` | `declined` | `decline` | closes it |
| `applied` | `undone` | `undo` (same people) | before `undo_until`, and only if the connector can and the live value still equals `after` |

No other move exists, and the code has no other way to set `status` (a test reads the SQL). **`approved` is never reached by anything that is not a person's tap** (see "What it must never do").

### One record of approval state

`discovery_proposals.status` is the only place approval state lives. The workspace reads it. WhatsApp reads it and writes it through the same action. An ask (below) only records that a message was sent and what was tapped; it never says whether the change is approved. So: approve in the workspace and tap the old button on WhatsApp, and WhatsApp answers "already approved"; approve on WhatsApp and the workspace shows `approved` with "from WhatsApp" and the person's name. A test does each in both directions. A proposal leaving `proposed` (by any route) closes its open asks (`closed_reason` `proposal_decided` or `expired`), so a late tap finds a closed ask and is answered "closed".

### Idempotency

* **Making proposals:** a second check-up, a second press of "Prepare change" or a retried job makes no second live proposal (partial unique index on `(tenant_id, finding_id, type, target, subject_ref) where status in ('proposed','approved')`; the builder uses `on conflict do nothing` and returns the existing one).
* **Approve:** the row is locked (`for update`). `proposed` becomes `approved`; `approved` or `applied` answers 200 with `already: true` and does nothing (no second job, no second activity row); `declined`, `expired` or `undone` answers 409 `proposal_closed`; `failed` is a retry.
* **Decline** and **undo** the same way (`declined` / `undone` answer `already: true`).
* **Apply:** the job takes the row with a conditional update (`status = 'approved'` and `apply_started_at` null or older than 10 minutes), so two workers cannot both apply. The connector is given the proposal's id as an idempotency key and, because `read_current` is checked first, a write that already happened (the live value already equals `after`) is recorded as applied with receipt `ref: "already_true"` and written again by nothing.
* **A button tapped twice, or a message delivered twice,** is the same approve.

### Expiry

`expires_at` is 14 days after `proposed_at`. `discovery.sweep` (hourly, below) moves due `proposed` rows to `expired` (reason `time`) with an activity row. A check-up that no longer finds the finding expires its `proposed` proposals (`finding_gone`) and leaves an `approved` one to apply or fail by itself (its precondition will almost always fail `stale_before`, which is correct). Expired proposals can be seen in Proposals, "Closed", and are never applied: `approve` on one answers 409 `proposal_closed`.

## Apply

### The connector write interface (`modules/discovery/connectors/base.py`)

The Phase 1 `Connector` protocol keeps `kind` and `snapshot`. A connector that can change things also implements `WritableConnector`:

```python
@dataclass(frozen=True)
class Change:                      # what the connector is asked to do; plain data
    type: str; target: str; field: str
    location: Location; subject_ref: str
    before: object; after: object

@dataclass(frozen=True)
class Receipt:
    ref: str                       # the source's own id for what it did
    at: datetime
    undo_until: datetime | None    # None: this write cannot be undone

class WritableConnector(Connector, Protocol):
    writes: frozenset[tuple[str, str]]     # (target, field) pairs it can write
    undoable: frozenset[tuple[str, str]]   # the subset it can put back
    async def read_current(self, change: Change, ctx: WriteContext) -> object: ...
    async def apply(self, change: Change, ctx: WriteContext) -> Receipt: ...
    async def undo(self, change: Change, receipt: Receipt, ctx: WriteContext) -> None: ...
```

`WriteContext` carries `now`, `idempotency_key` (the proposal's id), and `spend(units)` with the same budget rule as `RunContext` (an apply is budgeted at 10 units for a real source, 0 for the sample). Writes raise `WriteError(code, en, ar)` (like `ConnectorError`, words in both languages): `stale_before` (the live value is not the "before" the owner saw), `not_permitted` (the account may not edit it), `refused` (the source refused the value), `unavailable` (try again; the only retryable one). A write never raises for "already done".

The engine knows a connector can write by `isinstance` and its `writes`; the `sample` connector declares `writes` for every `(target, field)` of the table above, and `undoable` for all of them. `connectors.get(kind)` and `AVAILABLE` stay as they are; `gbp` is not in `AVAILABLE`.

### The apply job (`discovery.apply`, not a background job: the owner is waiting)

1. In a transaction: lock the proposal; stop unless `approved` and not recently started; set `apply_started_at` and add 1 to `apply_attempts`.
2. Find the connection with `kind = connector_kind` and `status = 'on'`; none: fail `connector_off`.
3. `current = read_current(...)`. Compare with `change.before` by each field's own normal form (hours by day, phones by digits, text trimmed and case-folded, an empty reply equal to none). If `current` already equals `after`: record `applied` with `ref: "already_true"`. If it differs from `before`: fail `stale_before`.
4. `receipt = apply(...)`.
5. In a transaction: `status = 'applied'`, `applied_at`, `receipt`, `undo_until` (from the receipt), `verification = 'pending'`; if no live proposal of the finding is left and at least one is applied, set the finding `owner_done` (so the existing lifecycle verifies it: a later run that no longer finds it makes it `verified`; one that still finds it sets it back to `open`); for a review reply, set the review row's `replied` and `reply_text`; one activity row `proposal.apply` (actor ALYR, channel `system`).
6. Errors: `unavailable` is raised so the job runner retries with its backoff; after the last try the dead-letter handler sets `failed`, `apply_gave_up`. Any other `WriteError` sets `failed` at once with its code. Failure words are in `words.ERRORS`-style tables, both languages, plain: nothing a stack trace.

### The sample connector's writes

The fictional business must show the effect of an approval, so a re-run shows the score going up. Phase 1's `sample` is a script (stage = completed runs, up to 3) with no stored state, and connectors have no I/O. Phase 2 adds:

* Table `discovery_sample_state` (migration 0123): `(tenant_id, location_id, target, field, subject_ref)` is the key, `value jsonb`, `proposal_id`, `set_at`. These are **overrides** of the script: what the fictional owner changed. Only the sample writes them.
* `RunContext` gains `overrides` (loaded by the engine, so the connector still does no I/O); `snapshot` builds the stage's script and then lets an override win for its field.
* `read_current` builds the one place's script at the current stage with the overrides and returns the field. `apply` upserts the override and returns `Receipt(ref=<proposal id>, at=now, undo_until=now + 7 days)`. `undo` deletes the override if its value still equals `after`, else raises `stale_before`.
* The scripted improvements keep happening by stage (they stand for the owner fixing things themselves); an override can only add to them. The demo's claim is therefore "the finding closes and the score is higher than it would have been": the test compares two shops at the same stage, one with the approved proposal and one without.
* `python -m alyr.discovery_demo` also writes the sample's facts for the five branches (source `sample`, no `confirmed_by`; values from `sample.py`: the standard hours, the 5555 01xx numbers, the correct names). Turning the sample connection on (`set_connection`) writes them too, in the same transaction as the five places.

### `google_business_profile`: interface only, **not built**

A connector of kind `gbp` (already allowed by the Phase 1 check constraints) will implement `WritableConnector` against Google's Business Profile APIs. **It is not built here, and nothing stands in for it** (no placeholder class, no settings key, no screen: the same rule as `places` in spec 065). What it will need, from Google's own pages read on 9 Nov 2026 (the builder re-reads them first, as CLAUDE.md says):

* **API access is by application.** Google's prerequisites page asks for a Google Cloud project (its project number goes in the application), an organization account, a Business Profile that is **verified and active for 60 days or more** and has a website, and the "Application for Basic API Access" form from an address that is an owner or manager of that profile; Google replies by email; only then are the Business Profile APIs enabled for the project, and an OAuth 2.0 client ID is created for the app. The applicant can be ALYR (an agency applying for the clients it manages) or each business; which one, and whether ALYR's own profile qualifies, is for the founder to decide and do. This is the founder's step (ALY-325, label Needs Akmal).
* **Per-business sign-in.** An owner signs in with the Google account that manages the profile, so an OAuth consent screen (and Google's verification of it) is needed, with the scopes it will ask for. Tokens are sealed in the database the way the WhatsApp token is (D-149), key in Secret Manager in Doha; never in the repository.
* **What it would write:** hours (`regularHours`), phone numbers, categories, and review replies (reply and delete reply), through `locations.patch` with an update mask and the reviews methods. Names (`title`) are left out of `writes` on purpose until the founder reads Google's rules on changing a listing's name. A website write is not a Google capability at all: `gbp` declares no `website` targets, so `add_whatsapp_link` and the website half of `hours_conflict` and `phone_conflict` are not proposed for it (their findings stay `owner`, as in Phase 1).
* **Undo** is a write of the old value, allowed only while the live value still equals what ALYR wrote, within 7 days; a reply is undone by deleting it.
* **Data and terms.** Phase 1's note stands: Google's policies limit what may be stored of a listing and its reviews (spec 065 "As built" 2). A write connector stores the receipt and the value ALYR wrote, which the owner approved, and nothing else of Google's content beyond what the lawyer clears (ALY-51). Data stays in Qatar except the write call itself, which carries the business's own facts and no customer data.

### Undo

Undo is offered while `now < undo_until` and the connector lists the `(target, field)` in `undoable`. It re-checks `read_current == after` first (if someone changed it since, 409 `undo_not_possible`, nothing is written), then writes `before` back and sets `undone`. It is on the activity record. An undone proposal's finding reopens at the next check-up (the problem is back) and its hash is in the 14-day cool-off, so the owner is not asked again at once. Undo is a workspace action in Phase 2 (there is no WhatsApp "undo" button); the "applied" message on WhatsApp says where.

### Verification

The check-up gains two steps after `findings.save`: `proposals.build` and `proposals.verify` (so a run uses at most 10 steps of its 60). `proposals.verify` looks at proposals with `verification = 'pending'` whose finding this run decided: finding `verified` (or `gone`) means `confirmed`; finding found again means `not_confirmed` (the screen says "Applied, but the next check-up still found it"). `verified_run_id` is the run. Nothing is reported as fixed until a run measured it.

## Data model

**Migration 0121 `discovery_proposals.sql`**

| Table | Columns | Notes |
|---|---|---|
| `discovery_facts` | `id`, `tenant_id`, `location_id` (cascade), `key` (`hours`,`phone`,`category`,`name`,`whatsapp`), `value jsonb` (object), `source` (`owner`,`sample`), `confirmed_by` (users, set null; required when `source = 'owner'`), `confirmed_at`, `updated_at`; unique `(tenant_id, location_id, key)` | |
| `discovery_proposals` | the columns above | checks: `status` and `type` lists, `expires_at > proposed_at`, `applied` needs `applied_at`, `declined` needs `decided_by` and `decided_at`, `undone` needs `undone_at`; partial unique index for one live proposal; a trigger refuses any update of `type`, `target`, `location_id`, `subject_ref`, `change`, `change_hash`, `finding_id`, `connector_kind` |
| `discovery_location_managers` | `tenant_id`, `location_id` (cascade), `user_id` (users, cascade), `created_at`; primary key `(tenant_id, location_id, user_id)` | who a branch manager is |

Indexes, each starting with `tenant_id` (`tests/test_tenant_isolation.py` fails otherwise): proposals `(tenant_id, status, proposed_at desc)`, `(tenant_id, finding_id)`, `(tenant_id, location_id, status)`, `(tenant_id, change_hash)`, and `(tenant_id, expires_at) where status = 'proposed'`; facts and managers by their primary key and unique index.

**Migration 0122 `discovery_asks.sql`**

| Table or column | Holds |
|---|---|
| `discovery_asks` | `id`, `tenant_id`, `proposal_id` (cascade), `contact_id` (contacts), `user_id` (users, the person), `change_hash` (what the message showed), `lang`, `sent_as` (`buttons`, `template`), `message_id` (messages, set null), `status` (`queued`, `answered`, `closed`), `answer` (`approve`, `later`, `details`, null), `closed_reason` (`proposal_decided`, `expired`, `opted_out`, `blocked_<reason>`, null), `created_at`, `answered_at`; unique `(tenant_id, proposal_id, contact_id)`: **at most one ask per proposal per person, ever**; index `(tenant_id, contact_id, created_at)` |
| `contacts.discovery_asks` | `boolean not null default false`: this staff number receives asks. Set by an owner or admin in Discovery's settings, which records service consent with source `discovery_asks_setting` (as the weekly report's setting does, `consent.record`), and by the person's own `PROPOSALS OFF` / `ON` |
| `discovery_settings` | one row per shop (created on first write): `tenant_id` primary key, `ask_cap_per_day integer not null default 3 check (between 1 and 5)`, `weekly_run boolean not null default false`, `updated_at` |

**Migration 0123 `discovery_sample_state.sql`:** `discovery_sample_state` as above, primary key `(tenant_id, location_id, target, field, subject_ref)`, one more tenant-first index not needed.

**Every table:** `tenant_id` with the `current_setting` default, row-level security enabled **and forced**, the `tenant_isolation` policy, grants to `alyr_app`, as `0001_core.sql` and `0120_discovery.sql` do. `tests/test_discovery_tables.py` is extended to the new tables (it reads the catalogue, so a missing table fails).

**The activity record** (`team.record`, subject `discovery`; reads are not logged, changes are). Actions, each with the proposal's id as `subject_id`, the channel, and a `detail` of plain values: `proposal.propose` (by `engine` or the person), `proposal.approve`, `proposal.decline`, `proposal.expire` (actor ALYR, channel `system`, with the reason), `proposal.apply`, `proposal.fail` (with the code), `proposal.undo`, `proposal.verify`; and for the other tables `fact.set` (subject_id the place), `managers.set` (the place), `settings.set` (the shop), `asks.opt` (the person's own switch). The `system` channel already exists on `activity`. The actor for work ALYR does by itself is `Actor(None, "ALYR")` (a new constant `team.ALYR`; not `team.ASSISTANT`, whose name is not to be shown to owners).

**Erasure and forgetting.** Every new table gets a rule in `core/erase_rules.py` ("deleted with the business", like the six Phase 1 tables); `tests/test_erase.py` fails otherwise and the daily job refuses to run. `discovery_asks.contact_id` points at `contacts`, so `core/forget.py`'s `TABLES` says "only staff have these; a team member cannot be forgotten here" (the words of `staff_pending`). The tables are in the owner's download automatically (it reads every table with a `tenant_id`). No proposal, ask or fact holds a customer's data: reviews' authors stay in `discovery_reviews` only.

**The sample's state** is erased with the business like the rest, and is never read for another shop (RLS).

## Actions, roles, routes

### The caller and the roles

`core/actions.py` gains one role constant, `ENGINE = "engine"`, **not** in `ALL_ROLES`, so every existing action refuses it. The check-up makes proposals as `Caller(None, "ALYR", ENGINE, "system")`.

Discovery keeps its three roles (`owner`, `admin`, `agent` = staff) and adds the **branch scope**: for a staff-role caller, `discovery_location_managers` says which places they manage. A caller's scope is "all places" for owner and admin and "these places" for a staff-role member, resolved fresh on every call.

| Action (key) | owner | admin | branch manager (staff role, own places) | staff role, no places | engine | agent door |
|---|---|---|---|---|---|---|
| `discovery.proposals`, `discovery.proposal` (read) | all places | all places | own places only (another place's id answers 404 `not_found`) | empty list | | |
| `discovery.facts` (read) | yes | yes | own places | no (empty) | | |
| `discovery.set_fact` | yes | yes | own places | no | | |
| `discovery.prepare` (make proposals for a finding now) | yes | yes | own places | no | yes (the build step) | yes, as `proposer_kind = agent` |
| `discovery.approve_proposal` | yes | yes | own places | **no** | **never** | **never** |
| `discovery.decline_proposal` | yes | yes | own places | no | | |
| `discovery.undo_proposal` | yes | yes | own places | no | | |
| `discovery.set_managers` | yes | yes | no | no | | |
| `discovery.settings` (read, change) | yes | yes | no | no | | |
| `discovery.set_my_asks` (own number on or off) | yes | yes | yes | yes | | |

Two rules that sit **inside** `approve_proposal`, independent of the role table: (1) the caller's `channel` must be `portal` or `whatsapp`; (2) the caller must have a `user_id`. So a future MCP caller (a different channel) and the engine cannot approve even if a role table is edited by mistake. A person acting through the MCP door approves in the workspace or on WhatsApp.

### Routes (`routes/discovery.py`, prefix `/api/discovery`, the same session, `module_on`, `?lang=en|ar`, errors `{detail, code, message_ar, ...}`)

Every addition is a **new route or a new key**; no Phase 1 shape changes.

| Method and path | Action | Answers |
|---|---|---|
| `GET /proposals?status=&location_id=` | list | `{items: Proposal[], counts, waiting}`. `status` is `live` (default: `proposed` and `approved`), `done` (`applied`, `undone`), `closed` (`declined`, `expired`, `failed`), `all`, or one status. Newest first, at most 100. `counts` has a key for each of the seven statuses. `waiting` is the number of `proposed` ones this caller may approve |
| `GET /proposals/{id}` | one | `Proposal` plus `history: [{at, event, by, channel, text}]` (the activity rows of that proposal, worded, newest last) |
| `POST /findings/{id}/proposals` | `prepare` | 200 `{items: Proposal[]}` (the live ones, new or existing). 422 `needs_fact` (`key` in the body), 409 `nothing_to_propose`, 409 `connector_cannot_write`, 409 `finding_closed` |
| `POST /proposals/{id}/approve` `{change_hash}` | approve | `Proposal` with `already` |
| `POST /proposals/{id}/decline` | decline | `Proposal` with `already` |
| `POST /proposals/{id}/undo` | undo | `Proposal` with `already` |
| `GET /facts?location_id=` | facts | `{items: Fact[]}`, each `{location_id, key, value, source, confirmed_by_name, confirmed_at, default: bool}` (the defaults for `name` and `whatsapp` are listed with `default: true`) |
| `PUT /facts` `{location_id, key, value}` | set fact | `Fact`; then the builder runs for that place's open findings that wanted this fact, so the proposal appears at once |
| `PUT /locations/{id}/managers` `{user_ids: UUID[]}` | set managers | `{items: [{user_id, name}]}`; owner or admin; members of the shop with the staff role only (else 422 `bad_manager`) |
| `GET /settings`, `PUT /settings` | settings | `{ask_cap_per_day, weekly_run, receivers: [{contact_id, name, last4, linked, receives}]}`; `PUT` takes any of `ask_cap_per_day` (1 to 5), `weekly_run`, `receivers: contact_id[]` (the numbers that receive asks) |

Additions to existing answers (new keys only):

* `GET /overview` adds `proposals: {waiting, approved, failed, next: Proposal | null} | null` (null for a caller who cannot list; `next` is the oldest-highest-severity waiting one the caller may approve).
* `Finding` (all routes that return one) adds `proposals: Proposal[]` (its proposals from the last 30 days, newest first, at most 6), `needs_fact: {key, location_id} | null`, `can_propose: boolean`. `GET /findings` rows add `proposals_waiting: integer` only.
* `PUT /locations` refuses removing a place that has an `approved` proposal (409 `proposal_in_flight`); removing a place deletes its proposals and facts with it (cascade).
* `PUT /connection` turning the sample on also writes its facts.

### `Proposal` (the shape both builders use)

```json
{
  "id": "6b0c...-uuid",
  "finding_id": "9d1e...-uuid",
  "rule_id": "hours_missing",
  "type": "set_hours",
  "target": "listing",
  "status": "proposed",
  "severity": "high",
  "title": "Set the opening hours at Nuqta Car Care - Al Sadd",
  "why": "Customers cannot tell when the branch is open.",
  "rule": "The listing shows no opening hours, and you confirmed this branch's hours.",
  "location": {"id": "4f2a...-uuid", "name": "Nuqta Car Care - Al Sadd"},
  "field": "hours",
  "field_label": "Opening hours",
  "where": "the listing",
  "before": {"text": "none", "lines": []},
  "after": {"text": "Sat to Thu 07:00 to 22:00; Fri 13:00 to 22:00",
            "lines": [{"day": "sat", "text": "07:00 to 22:00"}, {"day": "sun", "text": "07:00 to 22:00"},
                      {"day": "mon", "text": "07:00 to 22:00"}, {"day": "tue", "text": "07:00 to 22:00"},
                      {"day": "wed", "text": "07:00 to 22:00"}, {"day": "thu", "text": "07:00 to 22:00"},
                      {"day": "fri", "text": "13:00 to 22:00"}]},
  "change_hash": "e3b0c442...64-hex",
  "context": null,
  "evidence": [{"label": "Opening hours", "value": "none", "where": "Google listing", "seen_at": "2026-11-09T08:00:00Z"}],
  "proposer": "engine",
  "proposed_at": "2026-11-09T08:00:03Z",
  "expires_at": "2026-11-23T08:00:03Z",
  "decided": null,
  "applied_at": null,
  "undo_until": null,
  "failure": null,
  "verification": null,
  "sample": true,
  "can": {"approve": true, "decline": true, "undo": false},
  "already": false
}
```

* `title`, `why`, `rule`, `field_label`, `where` are words in the reader's language, built by rule from `proposal_words.py` (both languages, whole strings, `counted()` and `agree()` for counts).
* `decided`: `{by: "Huda", channel: "whatsapp" | "portal", at}` once approved or declined; for `undone` the same shape in `undone`. `failure`: `{code, message}`. `context` is `null` except for `reply_to_review`, where it is `{review: {rating, posted_at, author_name, body, language}}`: quoted data, shown escaped, never as markup, never in a message.
* `where` is "the listing" or "the website"; the words never name Google for the sample.
* `sample` is true when the connector is `sample`: the screens must say so (below).
* `can` is computed for the caller from role, scope and status; the screens use it and never guess.
* `already` is present on the answers of approve, decline and undo only.

The other states differ from the example only in these keys (every key is always present; absent values are `null`):

```json
{ "status": "applied", "decided": {"by": "Huda", "channel": "whatsapp", "at": "2026-11-09T09:12:40Z"},
  "applied_at": "2026-11-09T09:12:44Z", "undo_until": "2026-11-16T09:12:44Z",
  "verification": "pending", "can": {"approve": false, "decline": false, "undo": true} }

{ "status": "failed", "decided": {"by": "Huda", "channel": "portal", "at": "2026-11-09T09:12:40Z"},
  "failure": {"code": "stale_before",
              "message": "The listing changed since this was proposed. Nothing was changed. The next check-up proposes it again."},
  "can": {"approve": true, "decline": true, "undo": false} }

{ "status": "proposed", "type": "reply_to_review", "field": "review_reply",
  "before": {"text": "no reply", "lines": []},
  "after": {"text": "Thank you for your feedback. We want every visit to be better than this one. Please contact us on WhatsApp at +974 5555 0150 and tell the team how.", "lines": []},
  "context": {"review": {"rating": 3, "posted_at": "2026-10-20T11:00:00Z", "author_name": "A customer",
                         "body": "Waited long for the polish.", "language": "en"}} }
```

(`can.approve` on a `failed` proposal means "try again".)

### Error codes (added to `words.ERRORS`, English and Arabic; `DiscoveryError(code, status)`)

| Code | HTTP | When |
|---|---|---|
| `forbidden` | 403 | the role cannot do it (existing) |
| `not_found` | 404 | no such proposal, fact or finding **for this caller**: another shop's id, and a place outside a branch manager's scope, answer the same |
| `proposal_closed` | 409 | approve on a declined, expired or undone proposal |
| `proposal_decided` | 409 | decline on an approved or applied one |
| `proposal_changed` | 409 | `change_hash` is not the proposal's: the screen reloads |
| `proposal_not_applied` | 409 | undo on one that is not `applied` |
| `undo_window_over` | 409 | past `undo_until` |
| `undo_not_possible` | 409 | the connector cannot, or the live value is no longer `after` |
| `retry_limit` | 409 | a fourth attempt |
| `needs_fact` | 422 | a fact is missing; body has `key` and `location_id` |
| `bad_hours`, `bad_phone`, `bad_fact` | 422 | a fact's value |
| `nothing_to_propose` | 409 | the rule has no proposal for this finding, or every one is in cool-off |
| `connector_cannot_write` | 409 | the active connector cannot write that target and field |
| `bad_manager` | 422 | a user who is not a staff-role member of the shop |
| `bad_setting` | 422 | cap outside 1 to 5, or a receiver that is not a staff number of the shop |
| `proposal_in_flight` | 409 | removing a place with an approved proposal |

Failure codes stored on a proposal (words in both languages, shown in the sheet and in the WhatsApp result): `stale_before` ("The listing changed since this was proposed. Nothing was changed. The next check-up proposes it again."), `connector_off`, `connector_unavailable`, `not_permitted`, `refused`, `apply_gave_up`.

## Owner asks on WhatsApp

**Official WhatsApp only, through the outbound layer, to the owner or a registered manager number, never to a customer.** Nothing here calls a channel.

### Who may be asked

A person is asked only if all of these hold: their number is a staff contact (`contacts.role = 'staff'`) **linked to their login** (`contacts.user_id`, by `LINK`, D-065: the number is how the person is known, so a tap can be tied to a role); `contacts.discovery_asks` is true (the owner or admin marked it in settings, or the person did); their service consent is not `revoked`; and they may approve that proposal (owner and admin: any; branch manager: their places). A staff number that is not linked is never asked: it cannot be tied to a person, so a tap from it would approve as nobody. The asks builder takes only contact ids loaded by that query; there is no code path that takes a customer id (a test marks a customer as a receiver by hand and expects nothing).

### When an ask is sent

`modules/discovery/asks.py: send_due(conn, outbound, now)`, called by the sweep every hour and once after each check-up finishes. For each eligible person, in this order, it stops at the first that fails:

1. **Quiet hours:** not between 22:00 and 07:00 on the shop's clock (`modules/items/alerts.py` `in_quiet_hours`, with the shop's clock from `modules/items/clock.py`). The next hourly pass after 07:00 sends it.
2. **Daily cap:** fewer than `ask_cap_per_day` asks (default 3) already made to this person on the shop's day.
3. **One open ask at a time:** no ask of theirs is `queued` for a proposal that is still `proposed` and was made less than 24 hours ago.
4. **A proposal to ask about:** `proposed`, with at least one day left, no ask yet for this person, not prepared by this person in the last hour, in their scope; highest severity first, then oldest.
5. **The window:** if the person wrote to ALYR's number in the last 24 hours, the ask is a message with buttons. If not, it is the template `discovery_ask` **only when `ALYR_DISCOVERY_ASK_TEMPLATE_APPROVED` is on** (off until Meta has approved it). While it is off, no ask is sent outside the window, **no message is recorded as blocked**, and the proposal waits in the workspace and in the morning brief's line. This is stated plainly to the founder (below).
6. The ask row and the message are made in one transaction through `Outbound.send` (consent, the 24-hour window and `billing_paused` are re-checked there: the layer decides, not this module). A `blocked` result closes the ask with `blocked_<reason>` and is not retried (one ask per proposal per person).

The outbound layer's own messaging limit for the shop does not exist yet (the comment on `Outbound` says ALY-41 comes next). This cap is Discovery's own and stays when that arrives. There is no reminder: an unanswered ask is not repeated. Asks never go out for a proposal the person is looking at: a proposal made by hand by that person is skipped for an hour, and the Proposals area is where they see it.

### The messages

Rule-based voice, whole messages per language, no first person ("I", "we", "us", "our"), no AI words, no emoji, `*bold*` only for the shop's name, the rule line in italics (`_ ... _`) as the report does, every Arabic line opens with U+200F (RLM), Western digits, product names Latin. "ALYR" is feminine in Arabic and the sentence is built around it ("the hours you confirmed"), never "I".

**Inside the window** (`kind = buttons`; body at most 1,024 characters; the buttons at most 20 characters each):

```
*Nuqta Car Care*: a change is waiting for your approval.

Opening hours at Nuqta Car Care - Al Sadd
Now on the listing: none
Proposed: Sat to Thu 07:00 to 22:00; Fri 13:00 to 22:00

_By rule: the listing shows no opening hours, and you confirmed this branch's hours._
Nothing changes until you tap Approve.
```
Buttons: `Approve` · `Not now` · `See details` (`ids dc:<ask id>:approve`, `:later`, `:details`).

```
‏*نقطة لعناية السيارات*: يوجد تعديل بانتظار موافقتك.

‏ساعات العمل في نقطة لعناية السيارات - السد
‏الحالي في الملف التجاري: لا شيء
‏المقترح: السبت إلى الخميس 07:00 إلى 22:00؛ الجمعة 13:00 إلى 22:00

‏_بحسب القاعدة: لا تظهر ساعات عمل في الملف التجاري، وقد أكّدت ساعات هذا الفرع._
‏لا يتغير شيء قبل أن تضغط «موافقة».
```
Buttons: `موافقة` · `ليس الآن` · `التفاصيل`.

The two lines "Now" and "Proposed" are `change_lines(...).text` of the proposal, the same strings the workspace shows (a test compares them).

**Outside the window** (the template `discovery_ask`, utility, **written and held: not submitted to Meta; the founder's go is needed** and Meta may file it as marketing, in which case it is not used): five blanks (`{{1}}` shop, `{{2}}` what, `{{3}}` the place, `{{4}}` now, `{{5}}` proposed), three quick-reply buttons with the same three titles and the same ids as payloads.

EN: "Change waiting at {{1}}: {{2}} for {{3}} would go from {{4}} to {{5}}. Nothing changes until you tap Approve. Send PROPOSALS OFF to stop these messages."
AR: "تعديل بانتظارك في {{1}}: {{2}} لـ{{3}} سيتغير من {{4}} إلى {{5}}. لا يتغير شيء قبل أن تضغط «موافقة». أرسل «إيقاف التعديلات» لإيقاف هذه الرسائل."

Samples are the fictional Nuqta Car Care. Values are one line each (`clean()`), and by construction at most 240 characters (hours text at most 160 (seven different days), reply text at most 240): **never cut with an ellipsis**. Before this template can be sent, the layer needs a small extension (below).

**What a tap does** (`modules/discovery/asks.py: handle_reply`, called first by `modules/owner/chat.py` for a staff contact when the inbound `reply_id` starts with `dc:`; an inbound template button arrives with `type: "button"`, not `interactive`, so `channels/meta.py`'s parser reads `button.payload` into `reply_id`, per Meta's webhook reference):

1. Load the ask by id under the shop's RLS. Not found, or `ask.contact_id` is not the sender: the same reply "no longer available" (a forwarded button or a guessed id learns nothing).
2. `staff_link.caller_for` the sender. Not linked: the existing "not linked to a login" words. The role is read now, not remembered.
3. **Approve:** `actions.run("discovery.approve_proposal", id, change_hash = ask.change_hash)` with the caller's channel `whatsapp`. The ask is `answered`. **Not now:** the ask is `answered` and the proposal is left exactly as it is (it stays in the workspace until it expires; "Not now" never declines it; declining is a workspace action). **See details:** a message with every line of the change and the link, with `Approve` and `Not now` again.
4. A refusal becomes one of the replies below, by error code.

| Case | English | Arabic (draft) |
|---|---|---|
| Approved | "Approved: {what} at {place}. The change is being applied." | «تمت الموافقة: {what} في {place}. يجري تطبيق التعديل.» |
| Already approved | "This change was already approved." | «سبقت الموافقة على هذا التعديل.» |
| Applied (sent only if the person's window is still open; never as a template) | "Done: {what} at {place} is now {after}. You can undo it in your workspace until {date}." | «تم: {what} في {place} أصبح {after}. يمكنك التراجع عنه من مساحة العمل حتى {date}.» |
| Failed | "The change was not applied: {reason} Nothing was changed. It stays in your workspace." | «لم يُطبَّق التعديل: {reason} لم يتغير شيء. يبقى في مساحة العمل.» |
| Not now | "Okay. It stays in your workspace under Proposals until {date}." | «حسناً. يبقى في مساحة العمل ضمن التعديلات المقترحة حتى {date}.» |
| Expired or closed | "This change is closed. Nothing was applied." | «أُغلق هذا التعديل. لم يُطبَّق شيء.» |
| Another branch | "That change belongs to another branch. The owner approves it." | «هذا التعديل يخص فرعاً آخر. يوافق عليه صاحب المحل.» |
| Gone | "That request is no longer available. Open your workspace to see what is waiting." | «لم يعد هذا الطلب متاحاً. افتح مساحة العمل لترى ما ينتظرك.» |

`{reason}` is the failure code's sentence. `{date}` is the shop's own date ("Tue 24 Nov" / «24/11»), as the owner commands print it.

### Commands (added to `modules/owner/chat.py`'s word table and to `HELP`)

* `PROPOSALS` / «التعديلات»: the number waiting for this person and up to five of them, one line each ("1. Opening hours, Nuqta Car Care - Al Sadd"), the workspace link, or "Nothing is waiting." Read only; it is `discovery.proposals`, so it is scoped by the same roles.
* `PROPOSALS OFF` / «إيقاف التعديلات» and `PROPOSALS ON` / «تشغيل التعديلات»: this number stops or starts receiving asks (`discovery.set_my_asks`). The off reply: "Done. These messages are off for this number. Send PROPOSALS ON to turn them back on." / «تم. توقفت هذه الرسائل لهذا الرقم. أرسل «تشغيل التعديلات» لإعادتها.»

No typed "approve": a typed word does not say which change, so approval on WhatsApp is only ever a tap on the ask's own button.

### What the layer needs (small, backend-owned, in files the Go-live lane also touches: keep each change small and say so in the PR)

* `OutboundMessage` accepts `choices` on a `template` message. Inside the window `Outbound.send` sends it as `buttons` with the module's own body (it already turns a template into plain text there); outside it, the choices go as the template's quick-reply buttons. Stored in `messages.payload.choices`, as buttons are today.
* `channels/meta.py` sends the buttons as the template's `button` components (quick reply, one per choice, the choice id as the payload) and reads an inbound `type: "button"` into `reply_id`; `templates_sync.components` and `core/whatsapp_templates.py` create the `BUTTONS` component. **The builder confirms every field name against Meta's current template and webhook references before writing it** (CLAUDE.md, "How work is done" 2); the payload-per-send behaviour in particular was not confirmed in this spec.
* The simulator channel draws the choices so the whole flow runs locally.
* `Template` gets a `buttons: tuple[str, ...]` field; `test_every_template_follows_metas_rules` learns the button limits (at most 3 quick replies, each at most 25 characters).

## The morning brief and the Agent

**What exists.** ALY-134 (the daily brief) is a backlog issue; **nothing of it is on `main`**: no `modules/agent/day.py`, no `daily_briefs` table, no job. This spec therefore does not wire anything into a brief that does not exist. It specifies the part Discovery owns and the hook.

**The hook.** `modules/discovery/brief.py` offers one function, the only thing a brief (or the dashboard) may call:

```python
async def brief_line(conn, caller: Caller, lang: str) -> BriefLine | None
# BriefLine = {"key": "discovery_proposals", "count": int, "oldest_days": int,
#              "text": str, "href": str}
```

It answers `None` when Discovery is off for the shop, when the caller may approve nothing, or when the count is 0. Otherwise `count` is the number of `proposed` proposals the caller may approve (**whether or not an ask was sent**: the line is exactly where an ask could not go), `text` is built with `counted()` and `agree()` ("2 changes waiting for your approval" / «تعديلان بانتظار موافقتك») and `href` is `/app/discovery?view=proposals`. For ALY-134 this is the "Needs you now" section's Discovery line; the brief owns its own placement, wording around it, sending and templates. The brief's template and window rules are ALY-134's, and the brief carries no ask: it does not approve anything.

**The Agent's "Needs you now" today.** The same count is shown on the workspace home now, without waiting for the brief: `modules/agent/facts.py` loads `discovery_waiting` (only when the `discovery` module is on and the viewer is an owner or admin) and `modules/agent/insights.py` has one `task` insight, `discovery_proposals`, whose words are `brief_line`'s and whose rule line is "By rule: a proposed change is waiting for your approval, not older than 14 days". `AgentDashboard.tsx` needs no change: a Needs-you item already carries `words`, `detail`, `href` and `rule`. The Agent's tests that count its rules and check its words (`tests/test_agent.py`) are updated for one more insight.

## Scheduled check-ups (small, so asks do not depend on a button press)

Spec 065 had the `schedule` trigger and no scheduler. Without one, asks would follow only a check-up someone started. The sweep starts a check-up (`trigger = 'schedule'`) for a shop when `discovery_settings.weekly_run` is true, a connection is on, no run is queued or running, and the last finished run is more than 7 days old, at the first sweep after 06:00 on the shop's clock. **Off by default**; an owner or admin switches it on in settings. It uses `engine.start_run`, so it is one at a time and inside the same budgets.

## The sweep (`discovery.sweep`)

One loop in the worker, hourly, for each shop with `discovery` on, each shop in its own tenant transaction, registered as background work (customers' jobs first, D-078): expire due proposals; put `approved` proposals that were never started (older than 10 minutes) or lost (started more than 15 minutes ago, not finished) back on the queue; start a scheduled check-up if due; `asks.send_due`. It does nothing for a shop with the module off. It sends nothing itself.

## Screens (`apps/web/app/(product)/_workspace/`, the section at `/app/discovery`)

Built with the real shell, tokens and components; load `alyr-design` and `alyr-product-screen` first, and run the lean path of `alyr-design-review` before showing anything to the founder. Every word is in `discoveryCopy.ts` (or a sibling copy file) as `T = {en, ar}`. Light and dark, English and Arabic with logical CSS, 375 px and laptop, 320 px no sideways scroll, 44 px targets on phones, axe clean, no polling that re-animates or moves scroll.

### What stays true from Phase 1 (and one thing that stops being true)

The Phase 1 copy says the sheet "never says there is" an approval and that "nothing is applied outside ALYR". **That limit is removed where a proposal exists**, and only there: the sheet and the area say what will change, and the guarantee line replaces the limit, everywhere a proposal is shown: **"Nothing is applied without your tap."** / «لا يُطبَّق شيء قبل أن تضغط.» Findings with no proposal (the owner, Google or process ones) keep "I did this" and "Skip" exactly as in Phase 1. Nothing says AI; nothing "coming" is drawn (D-039): no Google connect button, no "Google" claim for the sample.

### Sample marking

When `proposal.sample` is true, the approval sheet carries once: "Sample business: this changes the made-up listing inside ALYR, not anything on Google." / «نشاط توضيحي: هذا يغيّر ملفاً تجارياً وهمياً داخل ALYR، ولا يغيّر شيئاً في Google.»

### Menu

`DiscoveryMenu.tsx`: Home, To do, **Proposals**, Reviews, Reports, and, for an owner or admin only, **Settings** (a new `?view=settings`). Proposals shows its waiting count in words beside it ("2 waiting"), not a number disc.

### Home (`DiscoveryHome.tsx`)

* The "Do this next" card keeps its place. When its finding has a waiting proposal the card adds the exact change in one line (`before.text` to `after.text`) and its action is **"Review the change"** (it opens the approval sheet; the card never approves on its own).
* The page's one Volt button is **"Review N changes"** while at least one proposal waits for this person, and "Run check-up" becomes its outlined twin; with none waiting it is "Run check-up" as in Phase 1. (Applying the one-Volt rule to the main action; flagged in the PR for the design review.)
* A short strip "Proposals" under "Up next": up to three waiting rows (field, place, age) and a link to the area; below "Done", applied ones show "Applied" with the confirmation state.
* The overview's `proposals` block is null for a role that cannot list: then nothing about proposals is drawn.

### To do (`DiscoveryTodo.tsx`)

A row whose finding has a waiting proposal shows a "Change ready" tag (words first), and a filter chip "Change ready" narrows to them. The kind group `agent` is now titled by what is true: "ALYR can change this after you approve" / «يمكن لـALYR تعديل هذا بعد موافقتك». Counts and tabs are as Phase 1.

### The finding sheet (`DiscoverySheet.tsx`)

* A block **"Proposed change"** above the evidence when `finding.proposals` has a live one: the `field_label`, the `where`, **Now** and **Proposed** (for hours, the seven `lines` in two columns), the expiry ("Waiting until Tue 24 Nov"), and the guarantee line.
* Footer, for an open finding with a waiting proposal the person may approve: **"Review and approve"** (Volt; opens the approval sheet) beside **"I did this"** and **"Skip"** (quiet). The final Approve tap is in the approval sheet, next to the exact before and after. A person who may not approve sees the block and "The owner approves changes." instead of the button.
* When `needs_fact` is set: a form "Confirm the real {field}" (hours: seven rows with open, close and a closed switch; phone, category and name: one field; every field has a visible label; the error in words beside it). Saving calls `PUT /facts`; the proposal appears in the same sheet. Only owner, admin and the branch manager of the place see it.
* Skipping or marking a finding done with a live proposal says what happens to it ("Its waiting change will be closed.").

### The approval sheet (`DiscoveryApproval.tsx`, new)

One sheet, used by Home, the finding sheet and the Proposals area (`?view=proposals&p=<id>` opens it: the link WhatsApp sends). Content by status:

| Status | Shows | Actions |
|---|---|---|
| `proposed` | title; the **exact before and after** (the same `text` and `lines` the API sends); `where`; the rule line ("By rule: ..."); the evidence; the guarantee line; the expiry; the sample line when it applies | **Approve** (Volt) sends `change_hash`; **Decline** (quiet); close |
| `approved` | "Being applied" with the steps polled every 1.5 s until `applied` or `failed`, then stops (never loops after) | none |
| `applied` | "Applied {date}{ from WhatsApp | in the workspace} by {name}"; "You can undo this until {date}."; verification: pending "The next check-up confirms it.", confirmed "Confirmed by the check-up of {date}.", not confirmed "Applied, but the check-up of {date} still found it." | **Undo** (outlined) while `can.undo` |
| `failed` | the failure's plain sentence and "Nothing was changed" where the code says so | **Try again** (while attempts remain, as `approve`), **Decline** |
| `declined` | who and when | none |
| `expired` | "Expired on {date}. Nothing was applied." | none |
| `undone` | "Undone {date}." and "The next check-up looks at the listing again." | none |

Every button is disabled while its request runs; a 409 `proposal_changed` reloads the sheet; any 409 shows its words and the current state, never a stale one. For a person with `can.approve` false the actions are absent and a line says who approves. For a review reply `context.review` is quoted as text under "The review" and never rendered as markup.

### The Proposals area (`?view=proposals`, `DiscoveryProposals.tsx`, new)

Tabs **Waiting** (`live`), **Done** (`done`), **Closed** (`closed`); a filter by place (for a branch manager only their places exist); each row is one card on a phone: field, place, `before.text` to `after.text` (each in `<bdi>`), status in words, age or expiry; a row opens the approval sheet. A line at the top: "Nothing is applied without your tap." Empty states are real: none waiting ("Nothing is waiting. The next check-up may find something."), Done and Closed empty, and a shop whose connector cannot write ("This source can be read but not changed here.", only if that can occur; today it cannot).

### Settings (`?view=settings`, `DiscoverySettings.tsx`, new; owner and admin)

* **Messages on WhatsApp:** each staff number with its name and last four digits, a switch "Send me changes to approve" for linked ones, and for an unlinked one "Link this number first" (the existing Team link screen); the daily limit (1 to 5, default 3); a note that nothing is sent outside WhatsApp's 24-hour window until the message's wording is approved by Meta (only while `ALYR_DISCOVERY_ASK_TEMPLATE_APPROVED` is off; the API sends `template_ready: boolean` in `GET /settings` so the screen can say so).
* **Branch managers:** for each place, a picker of the staff-role team members.
* **Confirmed details:** each place's hours, phone, category, name and WhatsApp number with who confirmed them and when; edit. (The only place a fact can be changed apart from the finding sheet's form.)
* **Weekly check-up:** one switch, off by default.

### Copy rules (EN and AR)

* Whole strings per language; counts through the web's `counted`-style helper (`discoveryLogic.ts`) and the API's words; no count after a preposition in Arabic; `<bdi>` around hours, phones, names, dates and every before and after; times 24-hour, Western digits.
* English: "change", "proposed change", "Approve", "Decline", "Undo", "Not now" (WhatsApp only), "Applied", "By rule: ...". Never: AI, smart, learns, predicts, assistant, "I", "we", "our", "magic", "automatically", "optimise".
* Arabic (draft until ALY-66): «تعديل» / «تعديلات مقترحة» / «موافقة» / «رفض» / «تراجع» / «بحسب القاعدة». ALYR feminine, products masculine, "Agent" never translated.
* Status is words first, colour second; no pulse; the only Volt button on a view is its main action.

## Tests (all through the real path: PostgreSQL, the simulator, HTTP)

New files `apps/api/tests/test_discovery_proposals.py`, `_facts.py`, `_apply.py`, `_asks.py`, `_roles2.py`, `_brief.py`; the Phase 1 files are extended where named.

1. **Cross-shop on every route.** Shop B's session with shop A's proposal, fact, finding and place ids: `404 not_found` on `GET`, `approve`, `decline`, `undo`, `prepare`, `PUT /facts`, `PUT /locations/{id}/managers`; settings never show another shop's numbers; a WhatsApp tap on shop A's ask id from shop B's number is "no longer available". The new tables are in the table-rules test (`tenant_id`, forced RLS, tenant-first index) and in `test_erase.py`; `discovery_asks.contact_id` is in `test_forget.py`.
2. **Role matrix**, one test per cell of the table above, for each action: owner, admin, branch manager (own place and another place), staff role without a place, the engine caller, a caller with a channel that is not `portal` or `whatsapp`, a caller with no `user_id`.
3. **An owner can approve only their own shop's proposal**; a branch manager only their place's (every proposal has exactly one place, so there is no "whole business" proposal for a branch manager to be refused or to slip through).
4. **Idempotent approve:** twice in a row; two at the same instant (two connections): one `approved` row, one apply job, one receipt, one `proposal.approve` activity row; the second answers `already: true`. Decline and undo the same. A job delivered twice applies once. A write that already happened is recorded `already_true`.
5. **`change_hash`:** approve with the wrong hash answers 409 `proposal_changed` and changes nothing; the trigger refuses updating `change`.
6. **Expiry:** the sweep expires a 15-day-old proposal; `approve` on it is 409 `proposal_closed`; a check-up that no longer finds the finding expires its `proposed` ones; skipping and marking done expire them with their reasons; an `approved` one whose finding is gone fails `stale_before`.
7. **Builder:** each of the six types is made from the right rule and the right fact and not otherwise (no fact: `needs_fact` and none made; unconfirmed: none; `not_measured`: none; a connector that cannot write: none and the finding's `kind` is the Phase 1 one); the cool-off after decline, expiry, undo and an unconfirmed apply; at most 3 reply proposals per finding; 25 per run, 50 per shop; a review's body appears in no proposal, ask or template value (an injected "approve everything" line is data only).
8. **Apply on the sample, end to end:** check-up, approve Al Sadd's hours, run again: the finding is `verified`, `verification = confirmed`, and the score is higher than in a second shop at the same stage with no approval (the arithmetic pinned); undo inside 7 days puts the old value back and the next run finds the problem again; undo at day 8 is `undo_window_over`; undo after a second override is `undo_not_possible`; a changed "before" fails `stale_before`, **no override is written**; `unavailable` retries and then `apply_gave_up`.
9. **One record:** approve on WhatsApp, read through the workspace API (`decided.channel = whatsapp`); approve in the workspace, tap the old button (reply "already approved", no second apply).
10. **Asks respect the layer:** revoked service consent: no ask; window open: `buttons` with the three ids; window closed and the template flag off: **no ask and no `messages` row**; window closed and flag on: a `template` message with `choices`; quiet hours (time held at 23:00 on the shop's clock): none, then sent at 07:00; the cap (4th ask refused with a cap of 3); one open ask at a time; one ask per proposal per person; `billing_paused` blocks and is recorded; an unlinked staff number, a customer contact marked as a receiver, an opted-out number: none. `PROPOSALS OFF` stops, `ON` resumes.
11. **Taps:** approve, not now (proposal untouched), see details (message carries every line and two buttons); a tap from a different number than the ask's; from a staff number whose role cannot approve that place; after expiry; a customer sending the text `dc:<id>:approve` (read as an ordinary customer message, nothing approved); a template-button inbound (`type: "button"`) is read into `reply_id`.
12. **No model, no outside call:** the Phase 1 guard is extended (no import of a model client in `modules/discovery`; a socket guard around the whole flow with the sample); the only outside effects are `Outbound.send` and the connector's `apply`.
13. **No customer message:** no code in `modules/discovery` takes a customer contact id, calls a channel, or calls `Outbound` except through `asks.py`, and `asks.py` loads contacts only through the staff query (an AST test, plus the behavioural test above).
14. **Words:** every proposal type, field label, failure code, error code and message exists in both languages and is non-empty; no ellipsis in Arabic; no AI word (the Phase 1 banned-word test, extended); Arabic lines open with RLM; the template passes `test_every_template_follows_metas_rules` (names, blanks in order and not first or last, at least ten other words, no line break, samples fictional, buttons within limits); ask texts match `change_lines`.
15. **Brief hook and Agent:** `brief_line` for each role, with 0 and with 3 waiting, in both languages (`counted` and `agree`), `None` when the module is off; the Agent's Needs you now lists the item for the owner only.
16. **Weekly run:** off by default; on, it starts one run when the last is over 7 days old, never two, never while one is queued.
17. **Web:** `pnpm lint`, types, the design check, `pnpm test` (new parsers for `Proposal`, `Fact`, `Settings` in `discoveryApi.ts`, hours text and `can` handling in `discoveryLogic.ts`), and `scripts/discovery-browser-check.mjs` extended: the finding sheet with a change, the approval sheet in each of the seven states, the Proposals area, the settings view, a role that cannot approve, English and Arabic, light and dark, 375 and 1440 px, axe, a real API or the fixtures.

## What it must never do (each has a test above)

1. **Show or change another shop's rows**, or let a branch manager see or act on another branch.
2. **Apply without a person's tap on that exact change.** `approved` is reachable only through `approve_proposal`, which refuses the engine, the agent door, any channel but `portal` and `whatsapp`, and a caller with no login; `apply` is called only by the apply job on an `approved` row; `change` is immutable; a button on WhatsApp approves the ask's own `change_hash`.
3. **Apply a change other than the one that was shown**, or onto a value that is no longer the "before" that was shown.
4. **Make an "after" ALYR was not given.** Every after comes from a confirmed fact, the place's own WhatsApp number, or a fixed reply template. No model, no free text, no value taken from Google, the website or a review.
5. **Send anything to a customer.** Asks go to linked staff numbers that opted in, and nowhere else.
6. **Bypass the outbound layer, consent, the 24-hour window, quiet hours or the daily cap,** or send a template Meta has not approved (the flag).
7. **Call a model or send personal data out of Qatar.** An ask carries business facts and the owner's own number; a reviewer's name or words never leave the shop's rows.
8. **Say it is done before it is.** "Applied" only after the connector accepted the write; "confirmed" only after a check-up measured it; a failure says so and says what was or was not changed.
9. **Nag.** One ask per proposal per person, one open ask at a time, no reminders, a daily cap, an off switch on the phone.
10. **Hide a refusal.** Declined, "Not now" and expired are distinct and visible; a refused change is not asked again for 14 days.
11. **Put a secret in the repository** (connector `config` holds none; the `gbp` tokens, when built, are sealed in the database).
12. **Hold up the customer's path:** the sweep is background work; the apply job is short and not behind other shops' work.

## Not in this spec

* **Real Google writes:** the `gbp` connector is an interface here and is not built (ALY-325; needs Google's API access, which is the founder's application).
* **`places` (reading Google listings)**, scheduled runs beyond the one weekly switch above, an export, a public audit page (spec 065's list stands).
* **AI-answer tracking and the category check** (Phase 3, ALY-326).
* **MCP tools** (ALY-327): the agent door's `propose`, and its refusal to approve, are specified here; the tools themselves are not.
* **The admin console** (ALY-328).
* Editing a reply's text or a proposal's value; "approve all"; posts, photos and listing creation; changes to Bookings' hours from Discovery; prefilling facts from Bookings; WhatsApp "undo"; reminders for unanswered asks; overnight opening hours.
* **The morning brief itself** (ALY-134): only `brief_line` and the Agent item are here.
* The outbound layer's shop-wide messaging limit (ALY-41).
* Submitting the template to Meta, applying for Google's API, native Arabic review: all the founder's.

## Who builds what

Two builders, no shared files. **If a change is needed in the other's files, it is asked for in the pull request, not made.** Both append to this spec only under their own heading in an "As built" section at the end (`As built: backend`, `As built: screens`) so the merges do not collide. `docs/status.md` and `docs/lanes/product.md` are updated by each in its own PR; expect to resolve a conflict there by keeping both bullets.

**Backend builder (`apps/api/`, phases A to D):** migrations `0121_discovery_proposals.sql`, `0122_discovery_asks.sql`, `0123_discovery_sample_state.sql`; `modules/discovery/`: new `proposals.py` (the state machine, the builder, `change_lines`), `facts.py`, `apply.py`, `asks.py`, `sweep.py`, `brief.py`, `proposal_words.py`; changed `actions.py`, `engine.py` (the two steps, the `kind` refresh, `RunContext.overrides`), `rules.py` (each rule's proposal type), `words.py` (errors, failure words, the step summaries of `proposals.build` and `proposals.verify`), `connectors/base.py` (the write protocol), `connectors/sample.py` (overrides, writes, facts); `routes/discovery.py`; `core/actions.py` (`ENGINE`), `core/team.py` (`ALYR`), `core/outbound.py`, `core/templates.py` (`discovery_ask`, held), `core/erase_rules.py`, `core/forget.py`, `core/words.py` (the `CHANGES` noun); `channels/meta.py`, `channels/simulator.py`, `templates_sync.py`, `core/whatsapp_templates.py` (template buttons, the inbound `button` type; small, flagged for the Go-live lane); `modules/owner/chat.py` (the commands and the call to `handle_reply`); `modules/agent/facts.py` and `insights.py` (one insight); `worker.py` and `config.py` (`ALYR_DISCOVERY_ASK_TEMPLATE_APPROVED`, default off; the sweep); `discovery_demo.py` (facts); all API tests.

**Screens builder (`apps/web/app/(product)/_workspace/`, phase E):** changed `Discovery.tsx` (the views), `DiscoveryMenu.tsx`, `DiscoveryHome.tsx`, `DiscoveryTodo.tsx`, `DiscoverySheet.tsx`, `discoveryApi.ts`, `discoveryCopy.ts`, `discoveryLogic.ts`, `discoveryUi.tsx`, `discovery.css`, `discovery.test.mjs`; new `DiscoveryApproval.tsx`, `DiscoveryProposals.tsx`, `DiscoverySettings.tsx`; `scripts/discovery-browser-check.mjs`. The one shared-shell touch, the menu's extra items, goes through `DiscoveryMenu.tsx` and is tested against every other section. It builds against the shapes in this spec (and its examples) until the API is up.

**Names both must use exactly:**

* Statuses: `proposed`, `approved`, `declined`, `expired`, `applied`, `failed`, `undone`. Verification: `pending`, `confirmed`, `not_confirmed`. Expire reasons: `time`, `finding_gone`, `finding_done`, `finding_skipped`, `superseded`.
* Types: `set_hours`, `set_phone`, `set_category`, `set_name`, `add_whatsapp_link`, `reply_to_review`. Targets: `listing`, `website`. Fields: `hours`, `phone`, `category`, `name`, `whatsapp_link`, `review_reply`. Fact keys: `hours`, `phone`, `category`, `name`, `whatsapp`.
* Routes and query values exactly as the table (`status=live|done|closed|all`); the answer keys `items`, `counts`, `waiting`, `already`, `can`, `needs_fact`, `proposals`, `proposals_waiting`, `can_propose`, `template_ready`, `receivers`; the request keys `change_hash`, `location_id`, `key`, `value`, `user_ids`, `ask_cap_per_day`, `weekly_run`.
* Error codes exactly as the table. Action keys `discovery.proposals`, `.proposal`, `.facts`, `.set_fact`, `.prepare`, `.approve_proposal`, `.decline_proposal`, `.undo_proposal`, `.set_managers`, `.settings`, `.set_my_asks`. Activity actions `proposal.propose|approve|decline|expire|apply|fail|undo|verify`, `fact.set`, `managers.set`, `settings.set`, `asks.opt`.
* The deep link `/app/discovery?view=proposals&p=<proposal id>`; the button ids `dc:<ask id>:approve|later|details`; the word table `PROPOSALS`, `PROPOSALS OFF`, `PROPOSALS ON`.
* The guarantee line, word for word: "Nothing is applied without your tap." / «لا يُطبَّق شيء قبل أن تضغط.»

## Open for the founder, and what was assumed

**Needs the founder (label Needs Akmal on the issues that carry them):**

1. **Submitting `discovery_ask` to Meta (EN and AR, utility, three quick-reply buttons).** Written and held; nothing is submitted by this work. Until Meta approves it and `ALYR_DISCOVERY_ASK_TEMPLATE_APPROVED` is turned on, an owner is asked on WhatsApp only inside their 24-hour window; outside it the proposal waits in the workspace and in the brief's line. Meta may file it as marketing, which would need marketing consent (ALY-44); in that case this template is not used and asks stay inside the window.
2. **Google Business Profile access (ALY-325):** the application described under "`google_business_profile`", the OAuth consent screen and its verification, and the decision whether ALYR applies once as an agency or each business does. Nothing in this spec waits for it: the product is complete on `sample`.
3. **ALY-66, the native review of the Arabic** (every string here is a draft) and **ALY-51**, the lawyer, for what a write connector may keep of Google's content.
4. Switching the weekly check-up on for a real business, and Discovery itself, remain the back office's switch (off for every shop).

**Assumed (change them here if wrong):**

* A "branch manager" is a staff-role member linked to places by the owner or an admin; there was no such concept to reuse (the Catalog's "manager" numbers are phone flags with no login and no place).
* The "after" of a proposal comes only from a confirmed fact; ALYR never infers the real hours. The owner types them once per place (or confirms the sample's), and that confirmation is the first half of the approval.
* "Not now" on WhatsApp leaves the proposal waiting; only "Decline" in the workspace closes it and starts the 14-day cool-off. Expiry is 14 days; the sample's undo window is 7 days; the default cap is 3 asks per person per day.
* Asks go only to linked staff numbers the owner marked, one at a time, never repeated.
* Template quick-reply buttons need a small extension of the outbound layer and the Meta channel, which the Go-live lane also edits; the exact Meta field names are to be confirmed against Meta's current reference by the builder (this spec read Meta's webhook reference for the inbound `button` message and did not confirm per-send payloads).
* The weekly scheduled check-up is included, off by default, because asks would otherwise depend on someone pressing "Run check-up".
* The Home page's Volt button changes to "Review N changes" while any waits (the one-Volt rule); the design review can overrule it.

**Not checked in writing this spec:** any code (nothing is built), the Arabic by a native speaker, Meta's current template-button request and webhook field names beyond the inbound `button` payload shape, Google's current field names and quotas for the write calls, the exact wording of every message against a phone, whether the existing `activity_subject_check` and `messages.payload` need changes for the new rows (the spec says no; the builder confirms), and whether ALY-134's eventual design fits `brief_line` as written.

## As built

### As built: screens (ALY-324, branch `aly-324-discovery-approvals-screens`)

The screens of phase E, in `apps/web/app/(product)/_workspace/`, against the shapes of this spec. What the spec did not fix, and what was chosen (each is easy to change; say so here first if the API differs):

1. **"Review N changes"** is a link, not a sheet: it opens the Proposals area (Waiting tab). "Run check-up" is its outlined twin while a change waits. A card's "Review the change" and a strip row open the approval sheet directly. The one Volt button of each sheet is Approve (the approval sheet), "Review and approve" (the finding sheet, only where a change waits and the person may approve) or "Confirm and prepare the change" (the fact form, only where no change waits).
2. **The approval sheet takes the finding sheet's place** (`FindingFlow`) instead of stacking on it: two sheets would answer one Escape twice. Closing it brings the finding back as it now stands.
3. **Several changes on one finding** (`hours_conflict` has one per target, replies up to three) are listed in one block; the footer's "Review and approve" opens the first that waits and may be approved, and each block has its own "Review the change".
4. **Menu**: Home, To do, Proposals, Reviews, Reports, and for an owner or admin Settings (`readView` gives anyone else Home for `?view=settings`). The waiting count ("2 waiting" / «2 بالانتظار») sits beside Proposals in the sidebar and in the phone's row, from `GET /proposals?status=live` (`waiting`), asked for when the menu is drawn and again when a change moves (a `alyr-discovery-changed` window event), never on a timer. The More sheet's rows carry no count. On a phone the row of views is a three-column grid (six views do not fit one row at 320 px). `page.tsx` is touched in four lines: `subItems(..., can_manage)`, `SubNav` and `ViewReporter` take `canManage`.
5. **Hours in a fact form**: seven rows of two text fields (24-hour, `07:00`, "7:00" accepted) and a Closed box, not the browser's time input, which shows 12 hours in some locales. Checked in the page's words and again by the API's 422 (its words are shown if it refuses). A fact in Settings is shown by `hoursText` in `discoveryLogic.ts`, the spec's grouping ("Sat to Thu 07:00 to 22:00; Fri 13:00 to 22:00"); a proposal's own text always comes from the API.
6. **"Prepare the change"** (`POST /findings/{id}/proposals`) is a button in the finding sheet when the person may propose (`can_propose`), the finding is open and `agent`, and nothing is live; a 422 `needs_fact` turns the sheet into the form for the `key` the API names.
7. **Declined** shows who and when and "The same change is not proposed again for 14 days." (the cool-off of "What it must never do" 10); Decline is one tap (the sheet says what it does once it has). **Closed** holds declined, expired and failed, as the route's `closed` does.
8. **Not drawn**: the empty state for a source that can be read but not changed (it cannot occur today, D-039), anything about Google for a connection that is not the sample, the Google connect button. The sample line is the spec's, once per sheet.
9. **`undone`**: the spec says undone carries "the same shape in `undone`" but its example has no such key; the screens read `undone` if there is one and otherwise the history's `proposal.undo` row. The date of a verification ("Confirmed by the check-up of 12 Nov.") is the history's `proposal.verify` row (the `Proposal` has no such date); without one the sheet says "a later check-up".
10. **Branch managers (Settings)**: the spec has a route to set them and none to read them. The screens read `managers: [{user_id, name}]` from each `GET /locations` item and draw the picker only where it is there; a picker that does not know who the managers are would, on one tap, remove the others. The staff-role members come from `GET /api/team` (`role === "agent"`).
11. **Settings** save when a control is changed (switch, limit, picker) and say "Saved."; the template note shows only while `template_ready` is false.
12. **Facts per place** (`GET /facts?location_id=`, one call for each place) with the five keys, who confirmed them and when, or "Not confirmed yet"; a default (`default: true`) says it is taken from the place's own details; `source: "sample"` says sample details.
13. **Added files**: `DiscoveryFacts.tsx` (the fact form, shared by the finding sheet and Settings). Changed beyond the list: `discoveryUi.tsx` (rows, before and after, tabs), `discoveryLogic.ts`, `discoveryApi.ts`, `discoveryCopy.ts`, `discovery.css`, `discovery.test.mjs`, `scripts/discovery-browser-check.mjs`.
14. **Copy**: whole strings in `{en, ar}`; the Arabic is a draft until ALY-66. Names and dates set inside a sentence are isolated (U+2068, U+2069) so the sentence does not reorder them; the "Approve" word is the product's (the Phase 1 tests that banned it now ban "I", "we", "our", "magic", "automatically", "optimise" in the new lines instead).

**Checked**: see the pull request (the fixture's matrix, the real API's, `pnpm lint`, types, the design check, build, `pnpm test`). **Not checked**: a real phone, the Arabic by a native speaker, anything on WhatsApp (the backend's), production.
