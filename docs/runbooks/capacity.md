# Runbook · Capacity: what ALYR carries, what to watch, how to grow

Measured 31 Oct 2026 on a local copy of production's shape (`scripts/loadtest/`), for the target of 50 active shops with headroom (ALY-266). D-130 to D-132 are the changes it led to; D-133 is the database decision for the founder. Everything below is a measurement of this repository's code at that date, not a promise about production: read "What was not measured" before relying on a number.

## In short

- **50 shops fit on the production shape as it is today, with the changes in this pull request, and not with a lot to spare.** 250 workspace tabs open at once (five in each shop), 1.3 customer messages a second, 0.5 order-page visits a second and 0.3 receipts a second, on the half-core database and one API instance: a typical request takes **26 ms, 19 in 20 take under 0.37 s, and a customer waits 0.9 s (1.5 s at the 95th percentile) for the reply to be handed to WhatsApp.** The database is about half busy (29% of a machine whose limit is 50%), and the one API instance's CPU touches its limit now and then.
- **The same load on the code before the change did not work:** a typical request took 11.8 s, 19 in 20 took under 21 s, and a customer waited 13 s (21 s) for a reply. Buying a bigger database alone would not have fixed it: on 2 vCPUs the old code, with the tabs alone, was still at 3.5 s and 7.7 s, because the API's one CPU was the limit.
- **100 shops need a bigger database.** On a 2-vCPU dedicated database and three API instances, the 100-shop load (500 tabs, 2.6 messages a second, 1 visit and 0.6 receipts a second) took 29 ms for a typical request and 183 ms at the 95th percentile, replies 0.8 s (1.4 s), with the database 35% busy. On the half core it would not fit (250 tabs already take half of it; not run).
- **The tabs are the load, not the customers.** 250 tabs ask for something 50 times a second, all day. Customers' messages, order pages and receipts at the 50-shop volume are each about a tenth or less of what one worker or one API instance can do.
- **Adding API instances does not help while the database is the limit; it makes it a little worse** (each instance keeps its own memory of answers, so the database is asked more often): two instances on the half core took 131 ms for a typical request against 29 ms for one. Move the database first (step 3 under "Scale up").
- **When it is too much, the API now says so quickly** (503 with `Retry-After`) instead of queueing until the caller gives up: at 35 order-page visits a second the old code took 2 s for a typical request and 5.5 s at the 95th percentile with nothing refused; the new code took 0.15 s and 0.43 s and turned 2.7% of requests away at once.

## The load we plan for

Per shop in a busy hour (our assumption, to be replaced by pilot data; 150 chats a day is the brief's, the rest is ours):

| What | A day | The busy hour (15% of the day) | Per second, busy hour |
|---|---|---|---|
| Customer chats | 150, about 4 messages from the customer in each | 90 messages | 0.025 |
| Order-page visits (about 4 requests each) | 50 | 7.5 | 0.002 |
| Orders | 15 | 2 | |
| Receipts and invoices | 4 | 0.6 | 0.0002 |
| Workspace tabs open and being looked at | 5 | 5 | each asks for its screen every 5 s, the home every 15 s |

So 50 shops in their busy hour are **1.3 messages a second, 0.1 order-page visits a second, 0.01 receipts a second and 250 tabs**, and 100 shops are twice that. The "mixed" test below runs 1.3 messages, 0.5 visits (five times the model) and 0.3 receipts (thirty times) a second beside the 250 tabs, to leave no doubt that nothing but the tabs matters. Three things sit on top: the Sunday report for every shop at once, a link posted where many people see it, and a rollout (the old and the new revision both connected).

The test assumes all five tabs of every shop are on a work screen at the same moment, which is harsher than real life (a hidden tab does not ask).

## How it was measured, and what that does not show

`scripts/loadtest/` builds a local copy of the production shape in Docker (see its README): PostgreSQL 16 limited to 0.5 CPU, 1.7 GB and 50 connections (`db-g1-small`'s sustained share and connection limit), one to three API containers of 1 CPU and 1 GiB (Cloud Run's instance), the worker at 1 CPU with every send taking 300 ms (Meta's latency; the simulator channel slowed by a test-only wrapper). Fifty fictional businesses made through the product's own sign-up and item code, each with 120 items, 1,500 customers, 18,000 messages and 600 orders (a month of the model), 15 of them with Documents on: 740 MB, 900,000 messages. Nine in ten conversations have been read. Every request is an open loop: it starts on schedule whether or not the last was answered. The load is driven by three processes, because one Python process driving 250 tabs became the slowest part of the test (it reached 100% of a core while the API sat at a third of its own).

What it does not show is in "What was not measured" at the end. One thing to know about the numbers: the laptop was shared with other work, and a run is a sample of 30 to 105 seconds. Runs of the same thing on a busy and a quiet machine differed by up to a factor of two near a limit; the figures below are from the quiet runs and from runs repeated, and a difference of 30% between two runs should be read as no difference. Differences of ten times are not noise.

## Results

CPU is "average/peak" with 100 as one core: the half-core database cannot show more than 50. "Refused" is a 503 with `Retry-After` (or a timeout): the server saying "busy" in a moment instead of making the caller wait.

### The workspace's tabs, on the production shape (half-core database)

| Run | Typical request | 19 in 20 under | Refused | API CPU | Database CPU |
|---|---|---|---|---|---|
| Before: 250 tabs, one API | 7.9 s | 14.5 s | 0.1% | 52/75 | 45/53 |
| After: 100 tabs (20 shops of 5, or 50 of 2), one API | 19 ms | 109 ms | 0.0% | 24/45 | 14/31 |
| After: 150 tabs, one API | 27 ms | 156 ms | 0.0% | 31/73 | 18/50 |
| After: **250 tabs, one API** | **29 ms** | **380 ms** | 3.0% | 40/83 | 26/50 |
| After: 250 tabs, two APIs | 131 ms | 1.15 s | 7.4% | 31/64 and 32/57 | 38/51 |

About half of the 3% and 7% refused are the first requests of 250 tabs opened within seconds (`/api/auth/me` and `/api/team`: 14% and 27% of their own); the other screens' share is under 2%. Opened over a few minutes, as people do, there is no such crowd.

### The busy hour, 50 shops (250 tabs, 1.3 messages/s, 0.5 visits/s, 0.3 receipts/s)

| Run | Typical request | 19 in 20 under | Customer waits for a reply | Refused | Database CPU |
|---|---|---|---|---|---|
| Before, half-core database | 11.8 s | 21.3 s | 13.0 s (21 s at the 95th) | 1.3% | 48/53 |
| After, half-core database, one API | **26 ms** | **368 ms** | **0.9 s (1.5 s)** | 5.5% | 29/51 |
| After, half-core database, two APIs | 167 ms | 1.2 s | 1.2 s (2.2 s) | 8.7% | 41/52 |
| After, 2-vCPU database, two APIs | 24 ms | 130 ms | 0.8 s (1.3 s) | 0.4% | 39/67 of 200 |

### 100 shops (500 tabs, 2.6 messages/s, 1 visit/s, 0.6 receipts/s), 2-vCPU database

| Run | Typical request | 19 in 20 under | Customer waits for a reply | Refused | API CPU | Database CPU |
|---|---|---|---|---|---|---|
| After, three APIs | 29 ms | 183 ms | 0.8 s (1.4 s) | 1.8% | 43/96, 45/100, 43/99 | 70/113 of 200 |

### What a bigger database alone would have bought (the original code)

| Run | Typical request | 19 in 20 under | API CPU | Database CPU |
|---|---|---|---|---|
| 250 tabs, one API, half core | 7.9 s | 14.5 s | 52/75 | 45/53 |
| 250 tabs, one API, **2 vCPU** | 3.5 s | 7.7 s | **87/103** | 70/119 of 200 |
| 250 tabs, one API, 2 vCPU, **changed code** | **22 ms** | **134 ms** | 46/94 | 25/49 of 200 |

On 2 vCPUs the old code is limited by the API's one CPU, not the database.

### The other work

| Work | Before | After | Where its limit is |
|---|---|---|---|
| **Customer messages** (webhook in, reply sent) | up to about 11 messages/s, then replies wait 20 to 40 s (20 offered: 27 s typical, 43 s at the 95th) | the same ceiling: **about 11 to 12 a second** (20 offered: 21 s and 36 s) | The worker's five places at 300 ms a send; the worker is 18% busy. `ALYR_JOBS_CONCURRENCY` moves it (step 1). The 50-shop busy hour needs 1.3; 100 shops 2.6. |
| **Order page**, 20 visits/s (about 80 requests/s) | 29 ms typical, 256 ms at the 95th | 39 ms, 252 ms | One API instance is at its CPU near 30 visits/s; past it the new code refuses (35/s: 145 ms and 426 ms, 2.7% refused; the old: 2.05 s and 5.5 s, nothing refused). The model needs 0.1 visits/s. |
| **A link posted where many see it**, 30 visits/s to one shop's public page | 538 ms typical, 1.2 s at the 95th, database at its limit | **8 ms, 33 ms, database 7% busy** | A shop's public page is worked out once per 3 seconds and shared. |
| **Receipts**, 3/s | 202 ms typical, 687 ms at the 95th | 162 ms, 342 ms | Drawing: about 5 a second per API instance. The model needs 0.01. |
| **Receipts**, 8/s (a burst) | 5.3 s typical, 6.8 s at the 95th; every connection held while drawing | **0.73 s, 1.2 s, 8.6% told to try again** | Two are drawn at once, six wait, the rest are refused at once. |
| **Sunday 09:00**, 50 reports due at once, 5 messages/s | replies 0.9 s typical, 3.8 s at the 95th | 0.84 s, 3.0 s (1.4 s with no reports) | The worker keeps three of five places for customers; 50 reports were made and queued within the 90 s run. At 100 shops, spread them (step 7). |

## Limits for 50 and 100 shops

What each part can do, measured, against what the model asks of it.

| Part | Limit (measured) | 50 shops need | 100 shops need | Verdict |
|---|---|---|---|---|
| Workspace tabs, half-core database, one API | 250 tabs at p95 0.38 s, database half busy | 250 | 500 | **50 shops: fits, with little room.** 100: does not fit (twice the database it has; worked out from the 250-tab run, not run) |
| Workspace tabs, 2-vCPU database, 2 to 3 APIs | 500 tabs at p95 0.18 s, database 35% busy, APIs 45% busy | 250 | 500 | 50 shops: ample. **100 shops: fits, with room for about a third more** |
| Customer messages (the worker) | 11 to 12 a second | 1.3 | 2.6 | 9 times and 4.5 times the need |
| Order-page visits, per API instance | about 30 a second | 0.1 | 0.2 | 300 and 150 times |
| A shop's link posted widely | 30 visits a second on one link, 7% of the database | | | no limit seen |
| Receipts, per API instance | about 5 a second | 0.01 | 0.02 | 500 and 250 times |
| Database connections | 40 of 47 in the worst rollout (budget below) | | | yes |

The sentence to take from this page: **50 shops on the half-core database work, with every tab looking, and there is no second helping.** Fewer tabs looking means more room in proportion (150 tabs ran at p95 0.16 s with the database a third busy). A dedicated 1-vCPU database doubles the room, so about 2 times at 50 shops (worked out, not run); a 2-vCPU database is what 100 shops need (run).

## What to watch, and when to act

All of these exist in Cloud Monitoring and Cloud Logging now, or are one metric to add. The first two already have alert policies in `infra/gcp/alerts/`; `sql-cpu-warning.json` is the new early warning (applied by `infra/gcp/monitoring.sh apply`, which the founder runs).

| Watch | Where | Fine | Act when | What to do (next section) |
|---|---|---|---|---|
| Database CPU | Cloud SQL `database/cpu/utilization` | under 50% in the busy hour | above 70% for 15 minutes (early warning, new), above 80% for 10 minutes (alert, exists) | step 3, then 4 |
| Database connections | `database/postgresql/num_backends` | under 25 | above 40 for 5 minutes (alert, exists); the budget is 40 at the worst rollout | read "The connection budget", do not raise a pool before the database limit |
| Database disk | `database/disk/utilization` | under 60% | above 80% for 10 minutes (alert, exists); it grows by itself, so this is a cost, not an outage | "Storage" below |
| Requests turned away | Cloud Run `request_count` for `alyr-api` with `response_code=503`, and the API's log line `busy:` (once in ten seconds, with how many) | none | more than 1% of requests for 5 minutes, or a `busy:` line in more than three of ten minutes | the database is the limit before the API is: step 3; if the database CPU is low, step 2 |
| Slow requests | Cloud Run `request_latencies` for `alyr-api`, 95th percentile | under 500 ms | above 1.5 s for 10 minutes | the same |
| Messages waiting | `/health/worker`, the `queue_late` alert (exists), `jobs` rows queued and due | nothing due for more than a few seconds | the `queue_late` alert | worker: `ALYR_JOBS_CONCURRENCY` up (step 1); database: step 3 |
| API CPU | Cloud Run `container/cpu/utilizations` | under 60% | above 80% for 10 minutes | Cloud Run adds instances by itself up to 3; if it sits at 3, step 5 |
| Worker CPU | the same, `alyr-worker` | under 60% | above 80% for 10 minutes, or the Sunday reports taking over 5 minutes | step 1 |

Look at these once a week while there are fewer than 20 shops, and when an alert fires. Two numbers read straight from the database say the same thing sooner: `select count(*) from jobs where status = 'queued' and run_at < now() - interval '1 minute'` (messages waiting) and Query insights (Cloud SQL, alyr-db) for the slowest query.

## Scale up, in order of cost

Do the first one that fits what you see; each is a change to a setting or a plan, none to the code. Prices are Doha list estimates (the figures and how they were reached are in D-133; Google's own calculator for `me-central1` has the last word).

1. **Free: the worker's places.** `ALYR_JOBS_CONCURRENCY` from 5 to 8 (a send waits on Meta, so more at once is nearly free; one running job can hold two connections, so keep it under the worker pool of 8, or raise `ALYR_DB_POOL_MAX_WORKER` and read the budget first). The ceiling for messages should move in proportion (about 11 a second now; 8 places would be about 18; not measured).
2. **Free: the memory of the answers.** `ALYR_POLL_CACHE_SECONDS` from 3 to 5. Tabs then share more answers and the database is asked less often (not measured); a customer's message shows up to two seconds later. Do not go above 5.
3. **About USD 30 to 100 a month more: a dedicated database** (D-133 has the options and the recommendation). The database is the first thing to fill up: 250 tabs alone keep the half core about half busy. A 1-vCPU dedicated machine doubles the sustained CPU, a 2-vCPU four times (a 2-vCPU database is what the 100-shop run above used); changing the tier restarts the database for a minute or two (do it in the maintenance window, Friday 00:00, and warn the shops). Nothing in the code changes, and the connection budget stays as it is (a bigger machine allows more connections, 100 or more; raise pools only after).
4. **About USD 14 a month more: a second API instance always running** (`--min-instances=2`). Only for availability (a restart of the one instance then drops no request) or for a faster start under a sudden spike; it does not add capacity while the database is the limit. Each instance keeps its own memory of answers, so two instances put about 40% more work on the database than one (measured above: the half-core database went from 26% to 38% busy with the same tabs); do this after step 3, not before.
5. **About USD 40 a month for each instance that runs all month: more API instances.** `--max-instances` from 3 to 6 changes nothing at rest (an instance that is not needed is not paid for) and lets a busy hour use more than three. Needs the database of step 3 first.
6. **About USD 130 to 260 a month: high availability for the database** (a standby in another zone, automatic failover). It is for outages of a zone, not for load, and it doubles the database's price. Do it when the first paying client's agreement promises availability, not before.
7. **When 100 shops come:** turn on `ALYR_REPORT_SPREAD_MINUTES=40` after the site says "on Sunday morning" instead of "at 9:00"; add a read replica or Cloud SQL's managed connection pooling only if connections, not CPU, are the limit; and have the founder look at moving the `messages` and `jobs` tables to monthly partitions (not needed below about 100 GB).

## The connection budget

Cloud SQL's `db-g1-small` allows 50 connections; 3 are kept for Google. The application may use 47.

| Who | How many | Why |
|---|---|---|
| API instance, `ALYR_DB_POOL_MAX` | 4 each, up to 6 (3 of the old revision and 3 of the new at a rollout) | a request holds a connection for a few milliseconds and most are answered from memory with none; the peak in every run above was 13 to 22 connections in all |
| Worker, `ALYR_DB_POOL_MAX_WORKER` | 8 each, up to 2 at a rollout | five jobs at once, a job can hold two connections for a moment |
| Migration job, a person's psql, the nightly export, the erase job | up to 7 left | |
| **Worst case** | 6 x 4 + 2 x 8 = **40** | |

A request waits at most 3 seconds for a connection (`ALYR_DB_ACQUIRE_TIMEOUT_SECONDS`) and at most 24 may wait (`ALYR_DB_MAX_WAITING`); then it is answered 503 with `Retry-After: 2`. If the alert for connections fires with the budget unchanged, something else is holding connections: look in Cloud SQL for sessions `idle in transaction` (PostgreSQL ends them after 60 seconds by itself).

## Storage

Measured on the test database after a month of the model for 50 shops (739 MB; a customer's photo is not kept in the database): messages 259 MB, finished jobs 311 MB (kept 30 days, then deleted), handled message IDs 58 MB (30 days), customers 43 MB, issued documents 18 MB for 470 receipts (39 KB each), orders and lines 27 MB.

| Grows | 50 shops, a year | 100 shops, a year | Kept how long |
|---|---|---|---|
| Messages (about 5 MB a shop a month) | 3.1 GB | 6.2 GB | as long as the business uses ALYR (the privacy notice) |
| Issued documents, if every shop issues 4 a day (a PDF is stored once, D-078) | 2.9 GB | 5.7 GB | by law, years |
| Orders, customers, bookings, activity | 0.7 GB | 1.4 GB | as long as the business uses ALYR |
| Finished jobs and handled message IDs | about 0.4 GB, and no more | about 0.8 GB, and no more | 30 days (D-075, `core/retention.py`) |
| Report cards as pictures (`message_media`): only a report sent inside the owner's 24-hour window keeps one; none were kept in the 50-shop test | at most one picture a shop a week | the same | with the message |

About 7 GB a year at 50 shops, 14 GB at 100. The disk is 10 GB and grows by itself (USD 0.23 a GB a month, so under USD 2 a month for each 7 GB); the backups and the nightly export grow with it. What to watch is not the disk but the database size against its memory (1.7 GB on `db-g1-small`): when the data a refresh touches stops fitting in memory, reads go to disk and every number above gets worse. That is the same signal as the CPU alert and step 3 answers it. If space ever matters: finished jobs could be kept 7 days instead of 30 (`core/retention.py DONE_DAYS`, one number, a decision for the founder because D-075 chose 30), and old messages could move to monthly partitions.

## What was not measured

- **Production.** Nothing here ran on Google Cloud. Cloud Run's autoscaling and its request queue were not in the test (the API containers were a fixed number and requests were spread evenly across them, request by request, which is the worst case for a per-instance memory of answers), and neither was the edge Worker or the web app in front of the API: every request in production crosses two more hops.
- **A shared core bursting.** Google's `db-g1-small` may run above its sustained half core for a while. The test held the database to a hard 0.5 CPU, so the half-core numbers are the sustained case; real ones may be better, in a way nobody promises.
- **Disk.** The data fitted in memory (a 1.7 GB machine and 740 MB of data). When the data a refresh touches stops fitting, reads go to disk and every number above gets worse. This is not tested; it is why the database size is on the watch list.
- **Meta.** Its real latency, its rate limits per number, a template send outside the 24-hour window, a media upload. The 300 ms was simulated.
- **Longer runs.** Nothing ran for more than two minutes. A slow leak, autovacuum on large tables and months of growth are not covered.
- **The web app.** The Next.js proxy was not in the path, so its own CPU (one instance, 512 MiB) at 250 tabs and its handling of a 503 are not measured.
- **The Meta webhook under pool pressure.** The change that lets it wait for a connection (D-132) is tested but was added after the runs; before it, 6% of the webhooks in one busy run were refused at the pool (Meta sends a refused one again).
- **Photo uploads and imports, the connect API, outgoing webhooks, sign-in and sign-up, the booking, payment and tracking pages, the back office.** None was loaded.
- **Two instances of the worker.** Jobs about one customer keep their order inside one process, not across two (D-077).

## Re-running it

`scripts/loadtest/README.md` has the commands. A run of one scenario takes three minutes; the database is put back to the same snapshot before each. The summaries of the runs quoted here are in `scripts/loadtest/results/`. The labels: `before-*` and `after-*` are the first round (one load process; used here for messages, receipts, the order page and Sunday, none of which came near what one process can drive); `f-*` is one more; `k-*` (half-core database) and `m-*` (2-vCPU database) are the final round with three load processes, and `-before-` in a name is the code of v0.3.2.
