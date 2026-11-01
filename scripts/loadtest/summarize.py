"""Average and peak CPU, memory and database connections from a run's samples (run.sh).

Input: lines of `time,name,cpu%,memory` as `docker stats` gives them (CPU 100 = one core), and
`time,pgconns,count,0`. Prints one line per container.
"""

import csv
import sys
from collections import defaultdict


def number(text: str) -> float:
    return float(text.strip().rstrip("%") or 0)


def memory(text: str) -> float:
    """MiB from `used / limit` as docker prints it."""
    used = text.split("/")[0].strip()
    for unit, scale in (("GiB", 1024), ("MiB", 1), ("KiB", 1 / 1024), ("B", 1 / 1048576)):
        if used.endswith(unit):
            return float(used[: -len(unit)]) * scale
    return 0.0


def main(path: str) -> None:
    cpu: dict[str, list[float]] = defaultdict(list)
    mem: dict[str, float] = defaultdict(float)
    conns: list[int] = []
    with open(path) as handle:
        for row in csv.reader(handle):
            if len(row) < 4:
                continue
            _, name, value, used = row[0], row[1], row[2], row[3]
            if name == "pgconns":
                conns.append(int(value))
            else:
                cpu[name].append(number(value))
                mem[name] = max(mem[name], memory(used))
    print(f"{'container':<20}{'cpu avg':>9}{'cpu peak':>10}{'mem peak MiB':>14}   (100 = one core)")
    for name in sorted(cpu):
        values = cpu[name]
        print(f"{name:<20}{sum(values) / len(values):>9.0f}{max(values):>10.0f}{mem[name]:>14.0f}")
    if conns:
        print(f"database connections: average {sum(conns) / len(conns):.0f}, peak {max(conns)}")


if __name__ == "__main__":
    main(sys.argv[1])
