# The API tests in slices (`ci`, jobs `api-shard`, `api-image`, `api`)

Why: one runner took about 39 minutes (up to 58 when runners were busy) to run the API's whole
suite, and a plain fix pays that twice before it can ship (the pull request, then `main`). The
suite now runs as six slices at once, each on its own runner with its own PostgreSQL, so `ci` lasts
as long as the slowest slice plus the fixed steps. Nothing was removed.

## The parts

| Job | What it does | Name that matters |
| --- | --- | --- |
| `api-shard 1` to `6` | `uv run pytest --shard=I/6`: a slice of whole test files, by weight; files whose names start with the same word (`test_catalog_*`, `test_documents_*`) always stay together | none |
| `api-image` | `ruff check`, the image built, started with production settings and asked for `/health`, `pip-audit` of the lock | none |
| `api` | passes only if every slice and `api-image` passed **and** the slices' reports add up to the whole suite, once | **`api`**: the required check in branch protection (below) |

`release-gate.yml` is untouched: it reads the conclusion of the whole `ci` run on the exact commit,
so a red, cancelled or missing slice holds a release back exactly as a red `api` did.

## What proves nothing was dropped

Every slice writes `shard-I.json`: tests collected (the whole suite), tests it chose, tests it
ran, files, pytest's exit status. `scripts/ci/shards.py check` (run by `api`) fails unless:
every slice from 1 to N reported; every slice collected the same number; the chosen counts add up
to it; no file is in two slices; each slice ran what it chose; each ended with exit status 0. A new
test file is picked up by itself (a file not in `tests/shard_durations.json` weighs the average).
`tests/test_ci_shards.py` tests the splitting and the check.

## Changing it

- **More or fewer slices:** edit the list under `matrix.shard` in `ci.yml`. Nothing else knows
  the number. Each slice costs one runner; the public repository has 20 at once, shared with `web`,
  `site`, `api-worker`, `secrets`, `e2e`, `rehearsal` and any other run in flight.
- **A slice is much slower than the others** (a new heavy file, or the weights are old): open the
  newest `ci` run on `main`, download the `api-shard-*` artifacts into one folder and run
  `python scripts/ci/shards.py durations <folder> apps/api/tests/shard_durations.json`. Commit the
  file. Do this every few weeks, or after a block of new tests; stale weights make the slices
  uneven, never wrong.
- **A test passes alone but fails in its slice** (it relied on another file running first): that is
  a bug in the test; fix the test. Do not move files by hand. Why files are grouped by their first
  word: the whole suite shares one database and some fixed demo shops, and the first sliced runs
  found `test_catalog_demos.py` passing only because `test_catalog_cards.py` (its neighbour) ran before it and cleaned up a row it needed gone (the test now clears it itself).
  Grouping keeps that neighbourhood intact; a dependency across groups would show as a red slice
  that is the same on every run, and is fixed in the test. A laptop's plain `pytest` is
  unchanged and still runs everything in one process.
- **Run one slice on a laptop:** `pytest --shard=3/6` (add `--shard-report=out.json`).

## Branch protection

The required contexts stay `api, web, api-worker, site, secrets` (`release.md`). The slices appear
as `api-shard 1` ... `api-shard 6` and `api-image`; they do not need to be listed, because `api`
fails when any of them does. If the founder ever lists them anyway, the names change with the
matrix.
