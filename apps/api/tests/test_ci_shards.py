"""The CI slicing of this suite (conftest.py "Sharding", scripts/ci/shards.py): a test file is
never left out or run twice, and the job that stands for the API fails when a slice is missing."""
import importlib.util
import json
import pathlib
import random

from conftest import shard_plan

SCRIPT = pathlib.Path(__file__).resolve().parents[3] / "scripts" / "ci" / "shards.py"


def _shards_module():
    spec = importlib.util.spec_from_file_location("ci_shards", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_every_file_lands_in_exactly_one_slice():
    rng = random.Random(7)
    weights = {f"tests/test_{i}.py": rng.choice([0.5, 3.0, 40.0, 700.0]) for i in range(90)}
    for total in (1, 2, 6, 8, 200):
        slices = shard_plan(weights, total)
        assert len(slices) == total
        flat = [name for part in slices for name in part]
        assert sorted(flat) == sorted(weights)


def test_the_plan_is_the_same_in_every_job():
    weights = {f"tests/test_{c}.py": float(i % 5) for i, c in enumerate("abcdefghij")}
    assert shard_plan(weights, 3) == shard_plan(dict(reversed(list(weights.items()))), 3)


def test_the_plan_balances_by_weight():
    weights = {"tests/test_big.py": 100.0, **{f"tests/test_s{i}.py": 10.0 for i in range(20)}}
    loads = sorted(sum(weights[n] for n in part) for part in shard_plan(weights, 4))
    # The big file sits alone on one slice; the twenty small ones fill the other three evenly.
    assert loads == [60.0, 70.0, 70.0, 100.0]


def _report(index, total, selected, files, ran=None, collected=100, exitstatus=0):
    return {"index": index, "total": total, "collected": collected, "selected": selected,
            "ran": selected if ran is None else ran, "exitstatus": exitstatus, "files": files}


def _write(directory, reports):
    for report in reports:
        (directory / f"shard-{report['index']}.json").write_text(json.dumps(report))


def test_check_passes_when_the_slices_ran_the_whole_suite(tmp_path):
    _write(tmp_path, [_report(1, 2, 60, ["a"]), _report(2, 2, 40, ["b"])])
    assert _shards_module().check(str(tmp_path)) == []


def test_check_fails_for_a_lost_slice_a_gap_a_short_run_or_a_red_slice(tmp_path):
    check = _shards_module().check
    cases = {
        "lost": [_report(1, 2, 100, ["a"])],
        "gap": [_report(1, 2, 60, ["a"]), _report(2, 2, 30, ["b"])],
        "short run": [_report(1, 2, 60, ["a"], ran=59), _report(2, 2, 40, ["b"])],
        "overlap": [_report(1, 2, 60, ["a"]), _report(2, 2, 40, ["a"])],
        "red": [_report(1, 2, 60, ["a"], exitstatus=1), _report(2, 2, 40, ["b"])],
        "empty slice": [_report(1, 2, 100, ["a"]), _report(2, 2, 0, [])],
    }
    for name, reports in cases.items():
        directory = tmp_path / name.replace(" ", "-")
        directory.mkdir()
        _write(directory, reports)
        assert check(str(directory)), name
    assert check(str(tmp_path / "nothing-here")), "no reports at all"
