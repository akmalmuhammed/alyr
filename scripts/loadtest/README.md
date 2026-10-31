# Load test of the API at the production shape

The scripts behind `docs/runbooks/capacity.md`. They build a local copy of production's shape
in Docker, seed it with fictional shops, and measure what the API does under the load a shop
puts on it. Nothing here talks to the internet or to any real service: the network is
internal, every WhatsApp number is the simulator, and the data is made up.

| Production (docs/hosting.md, infra/gcp/setup.sh) | Here |
|---|---|
| Cloud SQL `db-g1-small`, PostgreSQL 16, max_connections 50 | `postgres:16` at 0.5 CPU, 1.7 GB, max_connections 50 (`stack.sh up 0.5`); `stack.sh up 2` for a 2-vCPU tier |
| Cloud Run `alyr-api`, 1 vCPU, 1 GiB, up to 3 instances | 1 to 3 containers of the API image, `--cpus 1 --memory 1g` |
| Worker pool `alyr-worker`, 1 vCPU, 512 MiB | one container, `--cpus 1 --memory 512m`, sends take 300 ms (`patch/sitecustomize.py`) |
| Meta answers in about 300 ms | the simulator channel, slowed by `LT_SIM_SEND_MS` (test only, outside the product) |

A CPU limit in Docker is a quota of 50 ms in every 100 ms for 0.5 CPU. A real shared core can
burst above its sustained share, so these numbers are for the sustained case.

## One run, start to finish

Needs Docker. Everything it makes is named `alyrscale-*` (change with `LT_PREFIX`) and nothing
else is touched.

```bash
docker build -t alyrscale-api:now apps/api                  # the code to measure
export LT_IMAGE=alyrscale-api:now

scripts/loadtest/stack.sh up 0.5                            # Postgres at the production shape
scripts/loadtest/stack.sh fresh $LT_IMAGE                   # empty database, every migration
scripts/loadtest/stack.sh run seed.py --shops 50 --contacts 1500   # about 85 s
scripts/loadtest/stack.sh apps $LT_IMAGE 1                  # API and worker, to issue some documents
scripts/loadtest/stack.sh run load.py docs-seed --count 450
scripts/loadtest/stack.sh stop-apps
scripts/loadtest/stack.sh psql -c "update jobs set status = 'done' where status in ('queued','running')"
scripts/loadtest/stack.sh snapshot                          # every run below starts from this

scripts/loadtest/run.sh my-staff 2 staff --tabs 5 --duration 90
scripts/loadtest/run.sh my-mixed 2 mixed --duration 90 --msg-rate 1.3 --visit-rate 0.5 --doc-rate 0.3
scripts/loadtest/stack.sh down                              # remove everything
```

`run.sh LABEL APIS SCENARIO ...` restores the snapshot, starts that many API containers and
the worker, runs one scenario of `load.py`, and writes `.loadtest-state/results/LABEL*`:

- `LABEL.json`: what the client saw (count, rate, p50, p95, p99, max, errors per request kind,
  and for webhooks the wait of every customer for the reply, read back from the database).
- `LABEL-machines.txt`: CPU and memory of every container and the database's connections.
- `LABEL-queries.txt`: where the database spent its time (`pg_stat_statements`).

The code under test needs its migrations applied to the snapshot. When a branch adds one, restore
the old snapshot, run `stack.sh migrate $LT_IMAGE`, and take a second snapshot with
`LT_TEMPLATE=alyr_template_after stack.sh snapshot`; use the same `LT_TEMPLATE` in `run.sh`.

## Scenarios (`load.py`)

| Scenario | What it does |
|---|---|
| `order-page` | visits to `/api/store/<shop>`: the page, more items, one item, the live poll, for 70% a signed customer link, for 30% of those a cart check and an order |
| `webhooks` | signed Meta webhooks at a rate; then how long each customer waited for the reply to be handed to the channel |
| `staff` | five tabs in every shop, polling as the workspace does (`_workspace/Screens.tsx`, `poll.ts`): the screen every 5 s, the home every 15 s, the shop's details every 5 minutes |
| `documents` | receipts issued at a rate |
| `sunday` | every shop's weekly report made due at once, beside a steady stream of customers |
| `mixed` | the 50-shop busy hour: tabs, customers, order-page visits and receipts together |

Every scenario is an open loop (requests start on schedule whether or not earlier ones were
answered), so a server that falls behind shows it as latency and errors.

## Files

`stack.sh` builds and removes the stack and runs one-off containers; `run.sh` is one measured
run; `seed.py` makes the shops (through the product's own sign-up and item code) and their
history; `load.py` holds the scenarios; `summarize.py` reads the CPU samples; `patch/` is the
test-only send delay; `results/` holds the summaries kept in the repository.
