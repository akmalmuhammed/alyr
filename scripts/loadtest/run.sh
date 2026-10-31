#!/usr/bin/env bash
# One measured run: the database put back to the snapshot, the apps started fresh, one scenario of
# load.py, and what the machines were doing meanwhile (docs/runbooks/capacity.md).
#
#   LT_IMAGE=<api image> scripts/loadtest/run.sh LABEL APIS SCENARIO [load.py arguments]
#
#   scripts/loadtest/run.sh before-order-10 1 order-page --rate 10 --duration 60
#
# Writes .loadtest-state/results/LABEL.json (the client's numbers), LABEL-machines.txt (CPU and
# memory of each container, the database's connections) and LABEL-queries.txt (what the database
# spent its time on). Copy the ones worth keeping into scripts/loadtest/results/.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
P="${LT_PREFIX:-alyrscale}"
STATE="${LT_STATE:-$here/../../.loadtest-state}"
label="$1"; apis="$2"; scenario="$3"; shift 3
image="${LT_IMAGE:?set LT_IMAGE to the API image}"
stack="$here/stack.sh"

"$stack" stop-apps >/dev/null
"$stack" restore >/dev/null
"$stack" apps "$image" "$apis" >/dev/null
bases=""
for i in $(seq 1 "$apis"); do bases="$bases,http://$P-api$i:8080"; done
bases="${bases#,}"
mkdir -p "$STATE/results"
samples="$STATE/results/$label-samples.csv"
: > "$samples"
touch "$STATE/sampling"

# Sample every container's CPU (100 = one core) and memory, and the database's connections,
# about every two seconds, until told to stop.
(
  while [ -f "$STATE/sampling" ]; do
    docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}}' \
      $(docker ps --format '{{.Names}}' | grep -E "^$P-(api[0-9]+|worker|pg|load-[0-9]+)$") 2>/dev/null \
      | sed "s/^/$(date +%s),/" >> "$samples" || true
    conns=$(docker exec "$P-pg" psql -U alyr -d alyr -Atc \
      "select count(*) from pg_stat_activity where datname = 'alyr'" 2>/dev/null || echo 0)
    echo "$(date +%s),pgconns,$conns,0" >> "$samples"
  done
) &
sampler=$!
trap 'rm -f "$STATE/sampling"; wait $sampler 2>/dev/null || true' EXIT

"$stack" psql -qc "select pg_stat_statements_reset()" >/dev/null
# The load is driven by several processes (LT_SHARDS, 3 by default): one Python process driving
# 250 tabs becomes the slowest part of the test. Each writes its raw timings; merge.py joins them.
shards="${LT_SHARDS:-3}"
rm -f "$STATE/results/$label".shard*of*.json
pids=()
for k in $(seq 0 $((shards - 1))); do
  LT_BASE="$bases" "$stack" run load.py "$scenario" --label "$label" --shard "$k/$shards" "$@"     > "$STATE/results/$label.shard$k.log" 2>&1 &
  pids+=($!)
done
wait "${pids[@]}"
if [ "$shards" -gt 1 ]; then
  python "$here/merge.py" "$STATE/results" "$label"
else
  grep -v "Deprecation\|http.request" "$STATE/results/$label.shard0.log" || true
fi

rm -f "$STATE/sampling"; wait $sampler 2>/dev/null || true
python "$here/summarize.py" "$samples" | tee "$STATE/results/$label-machines.txt"
"$stack" psql -c "select left(regexp_replace(query, '\s+', ' ', 'g'), 110) as query, calls,
  round(total_exec_time::numeric / 1000, 1) as total_s, round(mean_exec_time::numeric, 2) as mean_ms,
  round((100 * total_exec_time / sum(total_exec_time) over ())::numeric, 1) as pct
  from pg_stat_statements where dbid = (select oid from pg_database where datname = 'alyr')
  order by total_exec_time desc limit 12" | tee "$STATE/results/$label-queries.txt"
"$stack" psql -Atc "select 'statements ' || sum(calls) from pg_stat_statements where dbid = (select oid from pg_database where datname = 'alyr')" \
  | tee -a "$STATE/results/$label-queries.txt"
