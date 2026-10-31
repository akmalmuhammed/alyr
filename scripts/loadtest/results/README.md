# Results quoted in docs/runbooks/capacity.md

One `LABEL.json` per run (what the client saw: count, rate, p50, p95, p99, max, errors and status
codes for each kind of request, and for webhooks the customers' wait for a reply) and one
`LABEL-machines.txt` (CPU average and peak of each container, 100 = one core, and the database's
connections). Made by `scripts/loadtest/run.sh`; `python scripts/loadtest/tables.py scripts/loadtest/results LABEL...`
prints the lines of the tables in the runbook.

| Label | What |
|---|---|
| `before-*`, `after-*` | first round: webhooks (`webhooks-20`), receipts (`docs-3`, `docs-8`), Sunday, order page (`order-20`, `order-35`); one load process; the half-core database |
| `f-before-hot-30` | a link posted widely, v0.3.2 code |
| `k-before-*` | v0.3.2 code, half-core database, three load processes |
| `k-*` | changed code, half-core database, three load processes (`staff-N`: N tabs; `-x2`: two API instances; `mixed`: the 50-shop busy hour; `order-35`, `hot-30`) |
| `m-before-staff-250` | v0.3.2 code, 2-vCPU database |
| `m-*` | changed code, 2-vCPU database (`mixed-100shops-x3`: the 100-shop load on three API instances) |

The laptop was shared with other work; a difference of 30% between two runs is not a difference.
