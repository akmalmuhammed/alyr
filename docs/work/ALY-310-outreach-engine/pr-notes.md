# ALY-310 outreach engine: notes for the pull request

Working notes of this piece of work (docs/hygiene.md section 1); keep only what is read again
after the merge.

## Outside documentation read (CLAUDE.md "How work is done" 2)

| Provider | Page | Read | What it settled |
|---|---|---|---|
| Anthropic structured outputs | https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md | 2 Nov 2026 | `output_config.format = {type: "json_schema", schema}`, no beta header; every object `additionalProperties: false`; no `minLength`/`maxLength`/`minimum`/`maximum`; `stop_reason` "refusal" and "max_tokens" mean the text may not match; claude-haiku-5-5 and claude-sonnet-5-5 supported |
| Anthropic Messages API | https://platform.claude.com/docs/en/api/messages/create.md (found through https://platform.claude.com/llms.txt) | 2 Nov 2026 | `POST /v1/messages`; the answer's `content[].type == "text"`; `usage.input_tokens`, `usage.output_tokens`; stop reasons. Its example uses `anthropic-version: 2026-10-21` and a Bearer header; the code uses `x-api-key` and `2023-06-01` as the structured-outputs page shows. Not tried against the real API |
| Anthropic pricing | https://platform.claude.com/docs/en/about-claude/pricing.md | 2 Nov 2026 | Haiku 5.5 USD 0.10 / 0.50, Sonnet 5.5 USD 2 / 10 per million tokens (the spend cap's prices, `outreach/llm.py`) |
| Exa search | https://exa.ai/docs/reference/search (docs.exa.ai redirects there) | 2 Nov 2026 | `POST https://api.exa.ai/search`, `x-api-key`; `query`, `numResults`, `type: "auto"`, `category: "company"`, `userLocation`, `contents.text.maxCharacters`; `results[].url/title/text` |
| Exa pricing | https://exa.ai/pricing | 2 Nov 2026 | USD 10 credit a month; search from USD 4 per 1,000 (lite), auto 7; contents 1 per 1,000 pages |
| Hunter API v2 | https://hunter.io/api-documentation/v2 | 2 Nov 2026 | domain-search (`data.emails[]` with `value`, `type`, `position`, `sources[].domain`, `verification.status`), email-verifier (`data.status` valid / invalid / accept_all / webmail / disposable / unknown; 202 still verifying; 222 server oddity), account (`data.plan_name`, `data.requests.searches`); key in `X-API-KEY` |
| Hunter pricing | https://hunter.io/pricing | 2 Nov 2026 | Free 50 credits a month (a verification 0.5 credit); Starter USD 49 a month or 34 yearly |
| Firecrawl scrape and credit usage | https://docs.firecrawl.dev/api-reference/endpoint/scrape and .../credit-usage | 2 Nov 2026 | `POST https://api.firecrawl.dev/v2/scrape`, Bearer; `url`, `formats`, `onlyMainContent`, `timeout`; `success`, `data.markdown`, `data.links`, `data.metadata.url`; `GET /v2/team/credit-usage` → `data.remainingCredits` |
| Overture Maps places | https://docs.overturemaps.org/guides/places/ | 2 Nov 2026 | Fields `names.primary`, `taxonomy.primary` (`categories.primary` before Dec 2025), `confidence`, `websites`, `emails`, `addresses[].country`; CDLA Permissive 2.0 / Apache 2.0; the DuckDB query shape (release `2026-10-21.0` in its example) |
| **Google Places API (New) Text Search** | https://developers.google.com/maps/documentation/places/web-service/text-search | **Not read: the fetch was blocked (permission not answered in time), 2 Nov 2026** | Coded to the known shape (`POST https://places.googleapis.com/v1/places:searchText`, `X-Goog-Api-Key`, `X-Goog-FieldMask: places.id,places.displayName,places.websiteUri`, `textQuery`, `regionCode`, `pageSize`; `places[].id`, `displayName.text`, `websiteUri`). **Check before setting the key.** Its policies page was not read either; the terms used are the founder's reading |
| Google Places (New): migrating to Text Search, and Place IDs | https://developers.google.com/maps/documentation/places/web-service/migrate-text and .../place-id | 3 Nov 2026 | Confirmed: `POST https://places.googleapis.com/v1/places:searchText`, headers `X-Goog-Api-Key` and `X-Goog-FieldMask`, body `textQuery`, `regionCode`, `languageCode`; field mask `places.displayName`; the place ID is `places.id` in Text Search. Place IDs are exempt from the caching limits, so storing them is allowed; Google suggests refreshing IDs older than 12 months. **Still not confirmed:** `pageSize` and `places.websiteUri` (the Text Search reference page could not be fetched) |

## New dependencies

None. httpx (already a dependency), and the standard library's smtplib, imaplib, email and
html.parser.

## Not checked

- No real provider was called: every test runs on simulators or on `httpx.MockTransport` fakes.
- No real SMTP or IMAP server; Google Workspace's SMTP and IMAP behaviour, Gmail's handling of
  `List-Unsubscribe-Post`, and deliverability.
- Google Places: `pageSize` and `places.websiteUri` (the rest of the request shape was confirmed on 3 Nov 2026).
- `tests/test_erase.py::test_it_works_for_an_owner_that_row_level_security_applies_to` was not run:
  it names the `alyr_test` database in its address, and this session tested on its own database.
- The Arabic opt-out sentence and unsubscribe page text are unreviewed (ALY-66).
- `infra/gcp/setup.sh` changes (the outreach secrets in its list) were checked with `bash -n` only.
