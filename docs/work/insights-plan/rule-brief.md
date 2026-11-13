# Brief for building one Agent rule (insights plan, phase 0)

Read first: `CLAUDE.md` (hard rules), `docs/work/insights-plan/plan.md` (sections 3 and 4: the
row for your rule says what the owner reads, which tables, what it needs), and one existing
rule for the pattern: `apps/api/src/alyr/modules/agent/insights.py` (`_find_unused`,
`_say_unused`, `_find_quiet_regulars` and its `Insight(...)` entry) with `facts.py` for how its
numbers are gathered. `words.py` has `B`, `count`, `agree`, `money`, `rich` for the Arabic.

## What you build

One file `apps/api/src/alyr/modules/agent/rules/<key>.py`:

```python
INSIGHT = Insight(key, number, kind, module, rule, find, say, action=... | status=..., money=...)
async def gather(conn, f: Facts) -> None:   # one bounded query; store the result in f.extra[KEY]
```

`find(f)` reads only `f.extra[KEY]` and returns a `Finding` or `None`. `say(finding, f, lang)`
returns the two lines (English and Arabic, the Arabic written whole for each count, never joined
from fragments). Register it: add the import and the name to `RULES` in `rules/__init__.py`
(one line; that file is the only shared file you edit).

## Rules of the road

- **Touch only:** your rule file, `rules/__init__.py` (one line), `tests/test_agent_rule_<key>.py`.
  Not `facts.py`, `insights.py`, `view.py`, `model.py`, any migration, `docs/status.md`,
  `CHANGELOG.md`, `docs/decisions.md`. Phase 0 uses data that is already stored. If the rule
  cannot be built without a new column or table, stop and say so in your report; do not add one.
- **Quiet when thin.** A rule says nothing unless there is enough data to be right (write the
  minimum in the `rule` text, in plain words, English and Arabic). A wrong card is worse than none.
- **No guessing words.** Nothing that reads as a mind at work (`test_agent.py` rejects "AI",
  "smart", "learns", "noticed", "predicts"). Never "soon" / "قريباً". Say what is true now. The
  card promises no action that is not built: give it an `Action` to a screen that exists
  (`/app/...`, check the routes in `apps/web/app/(product)/app`) or a `status` line. A message to
  customers is not built yet (marketing consent, ALY-44): say "Information only." (`INFO_ONLY`) or
  `NO_CONSENT` from `insights.py`, do not offer to write to them.
- **Money.** If the card shows an amount of the shop's money, a cost or a margin, set
  `money=True` (managers only, the view enforces it) and also gather only when `f.money`
  (`rules.gather_all` already skips it otherwise). Amounts are integer dirhams.
- **Cost of running it.** Every open workspace tab asks for these numbers. One query, a bounded
  window (30 to 90 days), predicates the `tenant_id`-first indexes can answer. Run `EXPLAIN
  (ANALYZE)` against a seeded shop and say what you saw. No loops of queries per row.
- **Tenant isolation.** Query only through the `conn` you are given (inside `db.tenant()`); never
  take a tenant id from anywhere. No new table.
- **Data.** Fictional only. No real customer data anywhere. The repo is public.

## Tests (both are needed)

1. `tests/test_agent_rule_<key>.py`, pure: build `Facts` (see `facts()` in `tests/test_agent.py`;
   pass `extra={KEY: {...}}`), prove the rule is quiet just below each threshold, speaks at it, in
   English and Arabic (no `{` `}` left in the text, Arabic text contains Arabic, no banned words;
   copy the checks in `test_each_rule_speaks_at_its_threshold_in_both_languages`), and respects
   `money`. 
2. In the same file, a real-database test of `gather`: insert rows through the product's own
   service code where it exists (otherwise the minimum SQL as the database owner, as other tests do),
   call `facts.gather(...)` or `rule.gather(...)` inside `db.tenant()`, and check the numbers.
   Include a second shop whose rows must NOT show up (row-level security) and an empty shop.
   Look at how `tests/test_agent.py` and the tests it imports (`new_business`, `sign_in`) set up a
   shop. A mutation check: break the rule's condition and watch a test fail.

Then run `tests/test_agent.py tests/test_agent_role_limits.py tests/test_agent_samples.py` and
your own file, and `ruff check` on what you touched. The sample screens must not change; if one
does, say why and update it only if the change is right.

## Running things (Windows blocks the database driver, so use containers of your own)

```
SCRIPT="C:/Users/akmal/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/side-session-notes/local_f5782c3e-baff-4ba2-8113-ff273b9bcdf0/insights-test.sh"
"$SCRIPT" <prefix> up                                  # your own Postgres and network, once
"$SCRIPT" <prefix> run uv run pytest tests/test_agent_rule_<key>.py -q
"$SCRIPT" <prefix> run uv run ruff check src tests
"$SCRIPT" <prefix> down                                # when done: removes only <prefix>-* things
```

Run it from inside your own worktree. Use the prefix your task gives you. Other sessions' stacks
are running on this machine: never stop, remove or use a container whose name does not start with
your prefix. Run long commands with a generous timeout. The first run installs the environment
(a minute or two).

## Finishing

Commit on your worktree's branch (rename it `insights-<key>` with `git branch -m`). Message: what
the rule says and why, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
Do not push, do not open a PR. Run your `down` command. Report: the branch and commit, the
rule's thresholds in words, the tables and columns it reads (verified against the migrations, not
assumed), tests run and results, the `EXPLAIN` finding, and anything you could not verify or did
not build.
