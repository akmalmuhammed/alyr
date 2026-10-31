"""Put the shards of one run together (run.sh): `python merge.py RESULTS_DIR LABEL`.

A single Python process cannot drive 250 workspace tabs without becoming the slowest part of the
test (it reached 100% of a core while the API instances sat at a third of theirs), so run.sh
starts several `load.py --shard K/N` and each writes its raw timings. This reads them all, works
out the percentiles over every request together, and writes `LABEL.json` in the shape that
`load.py` writes for a single process, then prints the same table. Standard library only.
"""

import json
import sys
from pathlib import Path

EXPECTED = (200, 201, 409, 404)


def percentile(values: list[float], q: float) -> float:
    return round(values[min(len(values) - 1, int(q * len(values)))], 1)


def main(folder: Path, label: str) -> None:
    shards = [json.loads(p.read_text()) for p in sorted(folder.glob(f"{label}.shard*of*.json"))]
    if not shards:
        raise SystemExit(f"no shard files for {label} in {folder}")
    wall = max(s["seconds"] for s in shards)
    latencies: dict[str, list[float]] = {}
    codes: dict[str, dict[str, int]] = {}
    for shard in shards:
        for name, values in shard["stats"]["lat"].items():
            latencies.setdefault(name, []).extend(values)
        for name, counts in shard["stats"]["codes"].items():
            into = codes.setdefault(name, {})
            for status, count in counts.items():
                into[status] = into.get(status, 0) + count
    table = {}
    for name in sorted(latencies):
        values = sorted(latencies[name])
        n = len(values)
        bad = sum(c for status, c in codes[name].items() if int(status) not in EXPECTED)
        table[name] = {
            "n": n, "per_s": round(n / wall, 2), "p50": percentile(values, 0.50),
            "p95": percentile(values, 0.95), "p99": percentile(values, 0.99),
            "max": round(values[-1], 1), "errors": bad, "error_pct": round(100 * bad / n, 2),
            "codes": dict(sorted(codes[name].items(), key=lambda kv: int(kv[0]))),
        }
    extra: dict = {}
    for shard in shards:
        for key, value in shard["extra"].items():
            if key == "reply_lag":
                continue
            if isinstance(value, (int, float)) and key != "queue_drained_after_s":
                extra[key] = extra.get(key, 0) + value
            else:
                extra[key] = max(value, extra.get(key, value)) if isinstance(value, (int, float)) \
                    else value
    lags = sorted(x for s in shards for x in (s["extra"].get("reply_lag") or {}).get("lags", []))
    unanswered = sum((s["extra"].get("reply_lag") or {}).get("unanswered", 0) for s in shards)
    if any("reply_lag" in s["extra"] for s in shards):
        extra["reply_lag"] = (
            {"answered": len(lags), "unanswered": unanswered,
             "p50_s": round(lags[min(len(lags) - 1, int(0.5 * len(lags)))], 2),
             "p95_s": round(lags[min(len(lags) - 1, int(0.95 * len(lags)))], 2),
             "p99_s": round(lags[min(len(lags) - 1, int(0.99 * len(lags)))], 2),
             "max_s": round(lags[-1], 2)} if lags else {"answered": 0, "unanswered": unanswered})
    result = {"scenario": label, "seconds": wall, "shards": len(shards), "requests": table, **extra}
    (folder / f"{label}.json").write_text(json.dumps(result, indent=1))
    print(f"\n== {label}  ({wall:.0f} s, {len(shards)} load processes)")
    print(f"{'request':<18}{'n':>7}{'/s':>8}{'p50':>9}{'p95':>9}{'p99':>9}{'max':>9}{'err%':>7}")
    for name, row in table.items():
        print(f"{name:<18}{row['n']:>7}{row['per_s']:>8}{row['p50']:>9}{row['p95']:>9}"
              f"{row['p99']:>9}{row['max']:>9}{row['error_pct']:>7}")
    for key, value in extra.items():
        print(f"{key}: {json.dumps(value)}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2])
