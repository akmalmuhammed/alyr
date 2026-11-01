"""One line per run, from the result files of run.sh, for the tables in docs/runbooks/capacity.md.

    python scripts/loadtest/tables.py .loadtest-state/results label1 label2 ...

Prints: requests, how many were refused or failed (503 and timeouts are the server saying "busy",
anything else is an error), the p50 and p95 of all requests (each kind weighted by how many there
were), the slowest kind's p95, the reply wait of customers where the run measured it, and the
CPU of each machine (100 = one core). Standard library only.
"""

import json
import re
import sys
from pathlib import Path


def machines(path: Path) -> str:
    if not path.exists():
        return ""
    out = []
    for line in path.read_text().splitlines():
        m = re.match(r"alyrscale-(\S+?)(?:-\d+)?\s+(\d+)\s+(\d+)\s+(\d+)", line)
        if m:
            out.append(f"{m.group(1)} {m.group(2)}/{m.group(3)}")
        m = re.match(r"database connections: average (\d+), peak (\d+)", line)
        if m:
            out.append(f"conns peak {m.group(2)}")
    return ", ".join(out)


def summary(folder: Path, label: str) -> str:
    data = json.loads((folder / f"{label}.json").read_text())
    kinds = data["requests"].values()
    total = sum(k["n"] for k in kinds)
    busy = sum(c for k in kinds for status, c in k["codes"].items() if status in ("503", "0"))
    other = sum(k["errors"] for k in kinds) - busy
    p50 = sum(k["p50"] * k["n"] for k in kinds) / total
    p95 = sum(k["p95"] * k["n"] for k in kinds) / total
    worst = max(k["p95"] for k in kinds)
    lag = data.get("reply_lag") or {}
    wait = f"{lag['p50_s']}/{lag['p95_s']} s" if lag.get("p95_s") is not None else ""
    return (f"| {label} | {total} | {100 * busy / total:.1f}% | {100 * other / total:.1f}% | "
            f"{p50:.0f} | {p95:.0f} | {worst:.0f} | {wait} | "
            f"{machines(folder / (label + '-machines.txt'))} |")


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    print("| run | requests | busy (503) | errors | p50 ms | p95 ms | worst kind p95 | reply wait p50/p95 | CPU avg/peak |")
    print("|---|---|---|---|---|---|---|---|---|")
    for name in sys.argv[2:]:
        print(summary(folder, name))
