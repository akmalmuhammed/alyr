#!/usr/bin/env python3
"""The API test suite, split across CI jobs: the two bookkeeping jobs (stdlib only, no uv needed).

  shards.py check     <dir>        Fail unless every slice reported, the slices add up to the whole
                                   suite, and each slice ran every test it chose.
  shards.py durations <dir> <out>  Turn the slices' JUnit files into tests/shard_durations.json
                                   (seconds per test file), the weights that balance the slices.

How the slices are cut is in apps/api/tests/conftest.py ("Sharding"); why, and what to do when a
slice is slow or red, is in docs/runbooks/ci-shards.md. Reads files only.
"""
from __future__ import annotations

import glob
import json
import os
import sys
import xml.etree.ElementTree as ET


def check(directory: str) -> list[str]:
    """Return the problems; an empty list means the slices ran the whole suite exactly once. The
    number of slices is what the slices themselves were told (`--shard=I/N`), so changing the
    matrix in ci.yml needs no change here."""
    problems: list[str] = []
    reports: dict[int, dict] = {}
    for path in sorted(glob.glob(os.path.join(directory, "**", "shard-*.json"), recursive=True)):
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
        index = data.get("index")
        if index in reports:
            problems.append(f"slice {index} reported twice ({path})")
        reports[index] = data
    if not reports:
        return ["no slice reports found: the tests did not run"]
    totals = {r.get("total") for r in reports.values()}
    if len(totals) != 1 or None in totals:
        return problems + [f"the slices disagree on how many there are: {sorted(map(str, totals))}"]
    total = totals.pop()
    missing = [i for i in range(1, total + 1) if i not in reports]
    if missing:
        problems.append(f"no report from slice(s) {missing} of {total}: their tests did not run")
    extra = sorted(i for i in reports if not isinstance(i, int) or not 1 <= i <= total)
    if extra:
        problems.append(f"reports from slices {extra}, but the run has {total}")
    collected = {r["collected"] for r in reports.values()}
    if len(collected) != 1:
        problems.append(f"the slices did not collect the same suite: {sorted(collected)}")
    whole = max(collected)
    chosen = sum(r["selected"] for r in reports.values())
    if chosen != whole:
        problems.append(f"the slices chose {chosen} tests between them; the suite has {whole}")
    files = [f for r in reports.values() for f in r["files"]]
    if len(files) != len(set(files)):
        problems.append("a test file is in two slices")
    for index, r in sorted(reports.items(), key=lambda kv: str(kv[0])):
        if r["ran"] != r["selected"]:
            problems.append(f"slice {index} chose {r['selected']} tests and ran {r['ran']}")
        if r["selected"] == 0:
            problems.append(f"slice {index} chose no tests")
        if r["exitstatus"] != 0:
            problems.append(f"slice {index} ended with pytest exit status {r['exitstatus']}")
    return problems


def durations(directory: str) -> dict[str, float]:
    """Seconds per test file, summed over every test case in the JUnit files under `directory`."""
    seconds: dict[str, float] = {}
    for path in glob.glob(os.path.join(directory, "**", "junit-*.xml"), recursive=True):
        for case in ET.parse(path).getroot().iter("testcase"):
            module = next(
                (p for p in case.get("classname", "").split(".") if p.startswith("test_")), None
            )
            if module:
                key = f"tests/{module}.py"
                seconds[key] = seconds.get(key, 0.0) + float(case.get("time", 0))
    return {k: round(v, 1) for k, v in sorted(seconds.items())}


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[1] == "check":
        problems = check(argv[2])
        for line in problems:
            print(f"::error::{line}")
        if not problems:
            print("Every slice ran; together they ran the whole suite exactly once.")
        return 1 if problems else 0
    if len(argv) == 4 and argv[1] == "durations":
        data = durations(argv[2])
        with open(argv[3], "w", encoding="utf-8", newline="\n") as handle:
            json.dump(data, handle, indent=1)
            handle.write("\n")
        print(f"{len(data)} files, {sum(data.values()):.0f} s in all -> {argv[3]}")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
