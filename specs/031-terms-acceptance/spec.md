# 029 · Terms and the privacy notice, accepted at sign-up

Linear ALY-167 (epic ALY-163). Decision D-067. Builds on D-031 (self-serve sign-up), D-049 (the readiness check, one answer for `/start`, the workspace and `/ops`) and the privacy notice published on 28 Oct 2026 (ALY-72). The mechanism does not wait for the lawyer: the customer agreement is published as a version from the back office when ALY-98 and ALY-51 are done, and that asks every owner once.

## What it is for

ALYR processes an owner's business data and, through them, their customers' messages. Before any owner can create a business, ALYR needs a record that they were shown the privacy notice (and, when it exists, the customer agreement), which version, who, when and from where. When a new version is published, every owner is asked once. The record cannot be edited, because a record that can be edited proves nothing.

## The record

- **`terms_versions`** (migration 0059, ALYR's own, global): `kind` (`agreement` or `privacy`), `version`, a title and the address of the page in English and Arabic (a path on alyr.qa such as `/privacy`, or an https address), a sentence on what changed (both languages, optional), who published it and when. Every shop may read it (the sign-up screen shows it before the business exists); only the back office adds to it; **a published version never changes** (no update or delete is granted; a correction is a new version). The newest version of each kind is the current one.
- **`terms_acceptances`** (tenant-owned, append-only): the business, the version, the user, the owner's name as written, the time, the address and the browser. Unique per business and version, so accepting twice records once. The app may add to it and read it, never change or remove it. Row-level security as every tenant table.
- The privacy notice as published on 28 Oct 2026 (`2026-10-28`, `/privacy`, `/ar/privacy`) is the first version. **The customer agreement is not seeded**: it waits for the lawyer. Until the founder publishes it, owners accept the privacy notice only, and nothing is claimed about an agreement.

## What the owner sees

- **At sign-up**, on the "Tell us about your business" step: a group "Before you start" with one tick per current version ("I accept the Customer agreement"; "I have read the Privacy notice") and a link beside each that opens the page in a new tab. **Create my business stays off until every line is ticked**, and says why. If the terms change while the owner fills the form in, the API refuses (422), the screen shows the new ones, unticks them and says so.
- **In the workspace**, a banner at the top for the owner and admins only (nobody else can accept for the business) while a current version is not accepted: the title, one line per version with what changed, a link to read it, and one Accept. It does not go away until accepted. A business made before this existed sees it for the privacy notice.
- **On the go-live list**, a line "You accepted the terms and the privacy notice": done after sign-up, open with the same links and an Accept button for an owner who has not accepted. It is part of "ready" (the readiness check is the same one the workspace and `/ops` show).

## What ALYR sees (`/ops`)

- **Terms** (a console page): every version ever published (document, version, date, who, links, what changed) with the current ones marked, and a form to publish one. Publishing is irreversible and says so; it is written to the audit log.
- **On each client**: for every business, what it accepted (document, version, who, when) and what it has not accepted yet.

## API

- `GET /api/onboarding/terms/current`: the current versions (public, no account needed).
- `GET /api/onboarding/terms`: what the business in scope has been asked and what is still open.
- `POST /api/onboarding/terms/accept` `{version_ids}`: the owner or an admin accepts current versions (409 if one is no longer current: read the newer).
- `POST /api/onboarding/business` takes `accepted_terms` (the versions ticked); every current version is required (422 "accept the terms and the privacy notice to create your business") and **nothing is created without it, and the sign-up token is not spent**. Each acceptance is recorded in the new business's own record in the same request, with the address (`ratelimit.client_address`, so a visitor cannot choose it) and the browser.
- `GET/POST /api/admin/terms`, `GET /api/admin/businesses/{id}/terms`: the console.

## Rules

- **Only the owner accepts** (and an admin): a member of staff cannot accept for the business, and sees no banner.
- **Only a current version can be accepted**: an owner who read an older one is asked to read the newer.
- **Append only**, in the database's grants, not in the code: a test tries to change or remove a version and an acceptance as the application's own role and is refused.
- **English and Arabic** for every word on the owner's screens; the console is English only, as the rest of it.

## Not in this spec

- **The wording of the agreement.** It is the lawyer's (ALY-98, ALY-51). This builds the way to publish it and ask for it.
- **Withdrawing or disputing an acceptance, per-user acceptance** (only the owner's own acceptance for the business is recorded, as the issue asks) and **marketing consent** (a separate thing: `core/consent.py`).
- **Existing businesses are asked, not blocked**: the banner and the go-live line ask; their workspaces keep working. Whether to block an owner who will not accept is the founder's and the lawyer's call.
- **Retention of the address and browser** (the record of processing, ALY-120): they are stored with the acceptance in the Qatar database, as evidence, for as long as the business exists.

## Checks

`tests/test_terms.py` (11): the privacy notice is what a new owner is shown; creating a business without accepting is refused and creates nothing (the token still works afterwards); the acceptance records who, when, version and address; the go-live list has the line, done after sign-up; a new version asks every owner once, an owner accepts, the other still waits, accepting twice records once; a newer version replaces the one before and an old one cannot be accepted; a member of staff cannot accept; only ALYR staff publish; a version is checked (no `javascript:`, no protocol-relative address, both languages, one version once); the application's own role cannot change or remove a version or an acceptance; the back office reads what a business accepted. `tests/test_tenant_isolation.py` knows the new global table. `scripts/terms-browser-check.mjs` runs it in a real browser at 375 px (320 for the sign-up and the banner), English and Arabic, light and dark: the real sign-up screens, the ticks and the link, Create off until ticked, the banner and its one-tap Accept, the go-live line, and the console's list and form; 44 px targets, every field named, nothing scrolls sideways, axe clean on what this adds.
