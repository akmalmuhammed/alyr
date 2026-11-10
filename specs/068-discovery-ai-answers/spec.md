# 068 · Discovery, Phase 3: is the business named when people ask for its trade in its city

Linear ALY-326 (this work; the issue also names a "category-query check", which is not in this spec, see "Not in this spec") · Decision D-168 · Builds on spec 065 (Discovery Phase 1: the check-up, the score and its `ai` part, which says "Not measured yet"), spec 066 (Phase 2: proposals, merged, PR #285), the action layer (`core/actions.py`, D-065), the jobs worker (D-078) and the data rules (CLAUDE.md hard rule 2, `docs/data-residency.md`, ALY-51, ALY-329).

Reserved for Discovery: migrations **0124 to 0129** (this spec uses **0124**), decisions **D-160 to D-169** (this spec takes **D-168**; D-167 is the footer's). Spec 067 is the MCP connector's.

**Status of this document: the contract, written before the code.** Where the build must differ, change this spec first, in the same pull request, and say so. Words in English are final; Arabic is a draft until ALY-66.

## What it is for

More people now ask a chat tool "best car care in Doha" instead of searching. If the business is named in the answer, a customer can find it there; if it is not, a competitor is. Phase 3 asks a small fixed set of **plain public questions** about the business's trade in its city, counts **by rule** whether the business is named in each answer, where in the answer, and which other businesses are named, and shows that in Discovery as a measured part of the score. Until the check has run, the part stays "Not measured yet", exactly as in Phase 1.

It is a measurement. It does not change anything, does not send anything to anyone, and does not say what an answer tool "thinks": it counts what a text contains.

## The rules this spec protects

1. **Only public questions go out, and they are not typed by anyone.** A question is built by `answers/questions.py` from a **closed list of trades and cities** and a few fixed templates ("best {trade} in {city}"). It contains no business name, no person, no phone number, no digit. The object an engine receives (`EngineRequest`) has exactly two fields, `text` and `lang`. Nothing from a shop's own customers, contacts, messages, orders, reviews or team ever enters a question, a prompt or a request (hard rule 2, ALY-51). A test fails if a field is added to `EngineRequest`, if a question is not exactly what the builder makes, or if any value of a shop with a distinctive name, number and contacts appears in anything an engine is sent.
2. **No outside call is made by this build.** The only engine is the **sample** one (fictional, no network). Real engines (OpenAI, Google, Perplexity, others) are **a contract and a gate**, off: a feature flag `ALYR_DISCOVERY_AI_LIVE` (default false), a key per engine read from settings (none in the repository), and **no provider code**. Tests fail on any outside call (HTTP clients and sockets are tripped) and on any import of a network library in the answers package. See "Real engines".
3. **No model sees personal data, and no model is called by ALYR to read an answer.** Counting is rule-based text matching (`answers/reading.py`). An answer is third-party text: it is stored as data, shown quoted and escaped, never rendered as markup, never reaches a template, a message or any other call.
4. **Never present a sample as a finding.** Sample answers carry the sample mark on every screen and in the API (`sample: true`), like Phase 1's sample data. A real engine's answers will never be marked sample, and a sample's are never anything else.
5. **Say only what was measured.** The `ai` part of the score is a number only when at least four answers were counted; otherwise it is `measured: false` and the screens say "Not measured yet" or show nothing. A score is not a ranking and not a forecast, and answers differ every time anyone asks: the screen says how many answers a number is out of, and that a few points is not a trend.
6. **Nothing is held up and nothing runs away.** The check is a step of the check-up, which is a background job (D-078). Caps: at most 6 questions per engine, 3 engines, 18 asks per check-up, a cost budget of its own, a monthly cap of asks for a live engine, 3 failures in a row stop an engine for that check-up.

## Words (what owners are told, and what they are not)

`docs/honesty.md` bans "AI", "assistant", "smart", "intelligent", "knows", "reads" and the like in anything ALYR says: ALYR does not use a model, and nothing may imply it does. This feature is about what **other** tools answer, so it needs a name for them. **The decision (D-168): owner-facing words say "answer tools" and "answers" («أدوات الإجابة»، «الإجابات»); the screens never say "AI" or "assistant", never name a product (no ChatGPT, Gemini or Perplexity), and never say ALYR asks "a model".** The founder may overrule this in one place (`answer_words.py` and the web copy file). Tests apply the same banned-word pattern the Discovery words already pass.

| Where | English | Arabic (draft) |
|---|---|---|
| Part name | Answers | الإجابات |
| What the part counts | How often your business is named when people ask answer tools for your trade in your city | عدد المرات التي يُذكر فيها نشاطك عندما يسأل الناس أدوات الإجابة عن مجالك في مدينتك |
| Headline, by rule | Named in 4 of 6 answers. | ذُكر نشاطك في 4 من 6 إجابات. (agreement through `counted()`) |
| The rule line | By rule: an answer names your business when it contains the name of the business or of one of its places. Position is its place in the answer's list. | بالقاعدة: تذكر الإجابة نشاطك عندما تتضمن اسم النشاط أو اسم أحد فروعه. الترتيب هو مكانه في قائمة الإجابة. |
| The caution | Answers change from one asking to the next. A few points is not a trend. | تتغير الإجابات من مرة سؤال إلى أخرى. بضع نقاط ليست اتجاهاً. |
| Sample | Sample answers, made up for the sample business | إجابات تجريبية لنشاط تجريبي |

The step's log sentence is English and contains none of the banned words ("counted", never "read").

## What is asked

### Trades, cities, templates (`answers/questions.py`)

* **Trades** (closed list, key, English plural phrase, Arabic plural phrase): `car_care` "car care" «خدمات العناية بالسيارات», `restaurant` "restaurants" «مطاعم», `cafe` "cafes" «مقاهي», `bakery` "bakeries" «مخابز», `salon` "women's salons" «صالونات نسائية», `barber` "barbers" «صالونات حلاقة», `spa` "spas" «مراكز سبا», `gym` "gyms" «نوادي رياضية», `grocery` "grocery stores" «بقالات», `fashion` "clothing stores" «متاجر ملابس», `ac_repair` "AC repair services" «خدمات إصلاح المكيفات», `home_services` "home maintenance services" «خدمات الصيانة المنزلية». No clinic or health trade (honesty.md: health data needs the lawyer).
* **Cities** (closed list): Doha, Al Rayyan, Al Wakra, Al Khor, Lusail, Umm Salal, Dubai, Abu Dhabi, Sharjah, Riyadh, Jeddah, Kuwait City, Manama, Muscat, each in both languages.
* **Templates**: English "best {t} in {c}", "where can I find good {t} in {c}?", "recommended {t} in {c}"; Arabic «أفضل {t} في {c}»، «أين أجد {t} جيدة في {c}؟»، «{t} موصى بها في {c}». Keys `best`, `where`, `recommended`. So a shop with a trade and a city has six questions per engine, and each is the same text on every check-up so a change is a change in the answer, not in the question.
* A shop chooses its trade and city from the lists (owner or admin). Nothing typed becomes a question.

### What an engine receives

`EngineRequest(text, lang)` and nothing else. The sample engine receives the same, so it proves the contract.

## Engines (`answers/engines.py`)

```python
class AnswerEngine(Protocol):
    kind: str                # "sample", later a provider
    live: bool               # True: it reaches outside ALYR
    cost_per_call: int       # units against the check-up's answers budget
    async def ask(self, request: EngineRequest, ctx: AskContext) -> RawAnswer: ...
```

`RawAnswer(text)`; errors are `EngineError(code, en, ar)` (plain words in both languages, like `ConnectorError`). `AskContext` carries `now`, `stage` (for the sample), the budget (`spend(units)` raises before the call that would pass it) and a per-call timeout.

* **`sample`** (built): deterministic and fictional, like spec 065's. Answers about car care in Doha, naming the fictional business **Nuqta Car Care** and five fictional competitors (Sahm Auto Spa, Hayat Detailing Lab, Basma Car Spa, Qamar Gloss Centre, Rukn Polish House; **checked 10 Nov 2026 by web search only** with Doha, Qatar and car care: none found; Google Maps, Instagram and the trademark register are the founder's before any name is shown outside ALYR). Three improvement stages by the number of earlier done check-ups (`min(n, 3)`), as the sample connector's: the share of answers that name the business goes 1 of 6, 2 of 6, 4 of 6, 6 of 6, and its position moves up; some answers name it only in a sentence, not in the list. It only answers `car_care` and `doha`; for another trade or city it raises `sample_only` (the call counts as an error, the part stays unmeasured).
* **`LiveEngine`** (the contract for a real one, **no provider is written**): a base class that checks the flag, the key and the monthly cap, spends the budget, applies a timeout, turns any failure into `EngineError`, and calls one abstract method with `(request, key)`. A provider is one file that implements it and one key setting, added only after the founder has chosen providers and read each one's terms, and after ALY-329 says where a model may run. The registry `engines.get(kind)` answers only for a kind in `AVAILABLE` (today `("sample",)`); kinds `openai`, `gemini` and `perplexity` are **reserved names** and refuse with `engine_unavailable`.

### Real engines: what turning one on would need (the founder's, ALY-329, ALY-51)

* The provider's current documentation and terms read first (CLAUDE.md "How work is done" 2): what may be stored of an answer, for how long, in what region the question is processed, whether a question is used for training.
* A key held as the WhatsApp token is (D-149): Secret Manager in production, `.env` locally, never the repository.
* `ALYR_DISCOVERY_AI_LIVE=true`, per installation, switched on by the founder.
* Because only a generic public question is sent, no merchant or customer personal data leaves Qatar; the legal reading of "a generic question sent to a provider outside Qatar" is still for ALY-51 to confirm, and `docs/data-residency.md` lists each provider before it is switched on.

## Reading an answer (`answers/reading.py`)

Pure functions, no I/O. `read(text, names) -> Reading`:

| Field | Meaning |
|---|---|
| `named` | the business's name, or one of its places' names (Latin or Arabic, folded for Arabic spelling, without a legal suffix and without what follows a dash or bar, so "Nuqta Car Care - Al Sadd" is the business "Nuqta Car Care"), occurs anywhere in the answer as a whole phrase |
| `position` | 1-based place of the first list item whose **lead** (its bold part, else its text up to a dash, colon, bracket or comma) is the business; null when it is named only in a sentence, or not at all |
| `list_size` | list items (numbered or bulleted, Western or Arabic digits) in the answer |
| `matched` | the words that matched, as the answer wrote them |
| `competitors` | the leads of the other list items, in order, deduplicated, at most 10, each at most 60 characters, ignoring leads of more than 8 words |

Honest limits (written on the screen): "named" is by name only; a nickname or misspelling is not matched; an answer with no list can still name the business but cannot give a position or competitors. A different business that shares a word ("Nuqta Pharmacy") does not match. A test pins each.

## The measurement

* Per check-up and per engine: each of the six questions is asked once. One row per answer in `discovery_answers`: the engine, question key, language, the exact question text, `status` (`ok`, `error`), `error_code`, the answer text (at most 4,000 characters), the reading, the cost and the time.
* **Score.** The `ai` part is `named / counted` over the answers with `status = ok`, across engines, each answer one check, rounded half up (exact fractions, as scoring does). **Measured only when at least 4 answers were counted**; otherwise `value: null, measured: false` and the total is as in Phase 1. Weight 10 (spec 065), renormalised with the other measured parts. `scoring.score(outcomes, answers=None)` is unchanged for a check-up with the check off.
* **Competitors table** (screen): the other businesses named across the last check-up's answers with how many answers named each, most first, at most 8.
* **History**: each check-up's `named` and `counted`, newest first, 12.

## Data (migration `0124_discovery_answers.sql`)

Every table has `tenant_id` with the `current_setting` default, forced row-level security, the `tenant_isolation` policy, grants to `alyr_app`, and an index that starts with `tenant_id` (`test_tenant_isolation.py` fails otherwise). A rule in `core/erase_rules.py` for each (deleted with the business, `tests/test_erase.py` fails otherwise). They are in the owner's download automatically. No row holds a customer's, contact's or team member's data.

| Table | Holds |
|---|---|
| `discovery_answer_settings` | one row per shop, made on the first write: `enabled` (default false), `trade`, `city` (keys of the closed lists, null until chosen), `engines text[]` (default `{sample}`), `monthly_ask_cap` (default 300, 1 to 1000, applies to live engines only), `updated_at` |
| `discovery_answers` | `id`, `run_id` (cascade), `engine`, `question_key`, `lang`, `question` (the text), `status`, `error_code`, `answer` (text, at most 4,000), `named`, `position`, `list_size`, `matched`, `competitors jsonb` (array of strings), `cost_units`, `asked_at`; unique `(tenant_id, run_id, engine, question_key, lang)`; indexes `(tenant_id, run_id)` and `(tenant_id, engine, asked_at desc)` |

The check-up row's `score_parts.ai` is the part, as for the others. Nothing else about runs changes.

## The check-up (`engine.py`)

A step **`ai.answers`** after `proposals.verify` and before `score.compute`, **only when answers are switched on** (so a check-up with them off has exactly the steps it had). It loads the settings and the business's names (its places and the business's own name), builds the questions, and for each engine and question asks (outside the database transaction), reads, and keeps the row. It then writes the rows (one transaction) and its log row (another). A step's failure never fails the check-up: an engine that errors makes `error` rows and the step says so; the part is then measured on what was counted, or not at all. The cost is added to the run's `cost_units`; the step has its own budget of 60 units (a live engine's `cost_per_call` is 5; the sample's 0), enforced by `AskContext.spend`, and the check-up's step budget is unchanged (one step more of 60). The step sentence: "Asked {n} public questions: your business was named in {named} of {counted} answers counted." / "Asked {n} public questions: {counted} answers counted, not enough to measure." / "Stopped at the cost limit after {n} questions."

## Actions and API

Actions on `core/actions.py`, module `discovery`: `discovery.answers` (read, all roles), `discovery.set_answers` (owner and admin; on the activity record as `answers.settings`, with the channel). The engine role is not in either. Routes under `/api/discovery`, `?lang=en|ar`, errors as the others (`{detail, code, message_ar}`). **Additions only; no Phase 1 or 2 shape changes.**

| Method and path | Answers |
|---|---|
| `GET /answers` | below |
| `PUT /answers/settings` `{enabled?, trade?, city?, engines?}` | the same as `GET /answers`; 422 `bad_trade`, `bad_city`, `bad_engine`, `needs_trade` (enabling with no trade and city, unless the sample connection is on, which sets `car_care` and `doha`), `sample_only` (the sample engine alone and a trade or city it does not cover); 403 for staff |
| `GET /overview` | gains `answers: {enabled, measured, named, counted, share, change} \| null` (null until the check has been switched on) |
| `GET /reports/{month}` | gains `answers: {share_start, share_end, named, counted} \| null` |

`GET /answers`:

```json
{
  "enabled": true,
  "available": ["sample"],
  "settings": {"trade": "car_care", "city": "doha", "engines": ["sample"], "monthly_ask_cap": 300,
               "trade_label": "car care", "city_label": "Doha"},
  "options": {"trades": [{"key": "car_care", "label": "car care"}], "cities": [{"key": "doha", "label": "Doha"}]},
  "engines": [{"kind": "sample", "label": "Sample answers", "sample": true, "live": false}],
  "questions": [{"key": "best", "lang": "en", "text": "best car care in Doha"}],
  "last": null,
  "previous": null,
  "change": null,
  "history": [],
  "headline": "Not asked yet.",
  "rule": "By rule: ...",
  "caution": "Answers change from one asking to the next. A few points is not a trend."
}
```

and, once a check-up has asked, `last` is `{run_id, asked_at, named, counted, share (0 to 100 or null), measured, sample, answers: [{id, engine, engine_label, question_key, lang, question, status, error, named, position, list_size, matched, competitors, text}], competitors: [{name, answers}]}`; `previous` is `{run_id, named, counted, share}`; `change` is `{share_change, since_run_id}` or null; `history` is `[{run_id, asked_at, named, counted, share}]`. `text` is the answer as data: the screen shows it quoted and escaped.

## Screens (`apps/web/app/(product)/_workspace/`)

A fifth view in Discovery, **Answers** (`?view=answers`), and a part in the score list **only when it was measured** (nothing "coming" is drawn, D-039). Home gets one quiet line under the score when answers are switched on and measured ("Named in 4 of 6 answers", linking to the view). The view: the headline and the sample mark; the questions with, for each, named or not, position and the others named; the competitors table; the history; "what it said" opening one answer as quoted text; a small form for owners and admins (trade, city, the switch). The one Volt button on the page is "Run check-up", as on Home. Tokens only, copy in a file as `T = {en, ar}`, both themes, both languages, 375 px and laptop.

## What it must never do (each has a test)

1. Send anything but a built public question: `EngineRequest` fields are exactly `text` and `lang`; every question equals the builder's output; no value of a shop (name, place names, numbers, emails, contact names) appears in anything sent.
2. Make an outside call: HTTP clients and `socket.create_connection` are tripped in the tests; the answers package imports no network library and names no table outside `discovery_*` and `tenants`; the flag and keys off means `get("openai")` refuses and no call is made; with the flag on and a key but no provider it still refuses.
3. Use or show another shop's rows: every route, shop B's session, shop A's rows; the table rules.
4. Say a number it did not measure: fewer than four counted answers is unmeasured; the arithmetic is pinned, including the renormalised total.
5. Let an answer act: its text is stored and returned as data, with markup and instructions inside it unchanged and inert; no template, message, job or model receives it (a test searches the module).
6. Run away: the caps in "The rules", each tested.
7. Say a banned word, or claim ALYR asked "an AI": the same banned-word and ellipsis tests as the Discovery words, in both languages.
8. Hold up a customer: it is a step of a background job.

## Tests

API on real PostgreSQL through HTTP (`tests/test_discovery_answers_*.py`): the migration and RLS rules; the closed lists and the templates; reading (the cases in "Reading an answer", Arabic spellings, a lookalike name, a list-less answer); the sample engine's three stages; scoring (below four is unmeasured, the weights renormalise); the check-up with answers off (the steps are exactly the old ones) and on (the step, the rows, the part, the cost); an engine that errors; the cost budget; the monthly cap; the privacy and no-network tripwires; the role matrix; every route cross-shop; erase; the words. Web: lint, types, design check, `pnpm test`, and `scripts/discovery-browser-check.mjs` extended for the view.

## Open questions, none blocking this build

* Which providers, in what order, and the legal reading of a generic public question sent to a provider outside Qatar (ALY-51, ALY-329): the founder's, before any key exists.
* The word for "answer tools" in owners' own language: the Arabic is a draft until ALY-66.

## Not in this spec

Real provider code and keys; a weekly schedule (the field exists in `discovery_settings`, `weekly_run`; the check-up is as Phase 2 starts it); findings and proposals from answers (there is no honest "what is needed" that follows from a count, so none is invented); the **category-query check** of ALY-326 (who wins a category or exact-match search, the client, a competitor or a directory: it needs a search source and its terms, a later pull request); the MCP tool for answers (ALY-327).

## As built (backend, ALY-326, branch `aly-326-discovery-ai-answers`)

What is built: migration `0124_discovery_answers.sql` (two tables), the package
`modules/discovery/answers/` (`questions.py`, `reading.py`, `engines.py`, `sample_engine.py`,
`service.py`), `answer_words.py`, `answers_actions.py` (`discovery.answers`, `discovery.set_answers`),
the `ai.answers` step in `engine.py`, `scoring.AnswersTally`, two routes (`GET /answers`,
`PUT /answers/settings`), additions to `GET /overview` and `GET /reports/{month}`, the flag
`ALYR_DISCOVERY_AI_LIVE` (default false, in `config.py`), and erase rules. The shapes of the spec are
kept. Where the build chose or added:

1. **The step is only in a check-up when answers are switched on**, so a check-up with them off has
   exactly the ten steps it had (a test pins the list).
2. **Failure words.** An engine's failure is stored as a code and worded when read (`answer_words.ERRORS`,
   merged into `words.ERRORS`), never as the engine's own message: a test raises an exception holding a
   key, a name and a number and proves none of it reaches an answer.
3. **Budgets.** 60 units for the step (`AI_COST_BUDGET`), 18 asks a check-up, three engines, three
   failures in a row stop an engine for that check-up. A budget stop ends all asking and the step says so.
   The cost is added to the run's `cost_units`.
4. **`sample_only`** also refuses switching on any trade or city but car care in Doha while the sample
   is the only engine; enabling with the sample connection on and nothing chosen sets them.
5. **The reading**: the business's names are the business's own name and every place's, base names (no
   legal suffix, nothing after a dash or bar); names shorter than four letters after folding are not looked
   for; Arabic is folded with the Catalog's `fold` (marks, alef, yeh, teh marbuta).
6. **Words.** "Answer tools" and "answers" (D-168). The step sentences avoid the banned words too
   ("counted", never "read").
7. **Keys.** No provider setting exists, because no provider does; `LiveEngine` reads `key_setting` from
   whatever settings it is given, which a test stubs.
8. **The overview's `answers` block** also has `sample` (true when every engine behind the last numbers is
   the sample); the report's has `sample` too. `GET /answers` also carries `limits` and `sample_note`.

### Tests

`tests/test_discovery_answers_pure.py` (55, no database: the closed lists, the two-field request, the
reading cases, the sample's four stages, the gate of a real engine, the score arithmetic, the words, and
the source scans: no network library, no message layer, no table but its own, only a built question
reaches `ask`), `tests/test_discovery_answers_api.py` (real PostgreSQL through HTTP: the module switch,
the role matrix, validation, the check-up off and on, the four stages in the score, the overview and the
report, engines that fail, cost too much or hit the monthly cap, what an engine is sent against a shop
with distinctive data, no outside call in a whole check-up, hostile answer text, cross-shop and the
database's own row rules), and the Phase 1 table test now lists the two new tables.

### Not built, and not checked

A real engine and its key (the founder's, with ALY-51 and ALY-329); the category-query check; a weekly
schedule; findings or proposals from answers; the MCP tool for answers (ALY-327). A web search found none of
the five fictional competitors' names (10 Nov 2026); Google Maps, Instagram and the trademark register
were not checked.
