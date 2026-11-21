import asyncio
import contextlib
import os

# Tests run as a developer machine; the app itself defaults to production (ALY-114).
os.environ.setdefault("ALYR_ENV", "local")

import asyncpg
import pytest
from fastapi.testclient import TestClient

from alyr.config import get_settings
from alyr.migrate import migrate

# Tests never reach the real photo store (ALY-103). A developer's .env may hold the live R2
# keys; an empty value in the environment beats the file, so photos stay on local disk.
# Only the opt-in live smoke test (tests/test_media_r2_live.py) needs the real values.
R2_LIVE = os.environ.get("ALYR_TEST_R2_LIVE") == "1"
R2_SETTINGS = ("ALYR_R2_ACCOUNT_ID", "ALYR_R2_ACCESS_KEY_ID", "ALYR_R2_SECRET_ACCESS_KEY")
if not R2_LIVE:
    for _name in R2_SETTINGS:
        os.environ[_name] = ""

APP_SECRET = "test-app-secret"
VERIFY_TOKEN = "test-verify-token"
NUMBER_ID = "100200300"

HOST = os.environ.get("ALYR_TEST_DB_HOST", "localhost:5432")
OWNER_SERVER = f"postgresql://alyr:alyr_local@{HOST}"

# By default the suite uses the local Docker database. To run it against any other
# PostgreSQL (a hosted one, for example), set both of these to an empty test database.
EXTERNAL = bool(os.environ.get("ALYR_TEST_OWNER_DSN") and os.environ.get("ALYR_TEST_APP_DSN"))
OWNER_DSN = os.environ.get("ALYR_TEST_OWNER_DSN") or f"{OWNER_SERVER}/alyr_test"
APP_DSN = (
    os.environ.get("ALYR_TEST_APP_DSN")
    or f"postgresql://alyr_app:alyr_app_local@{HOST}/alyr_test"
)


async def _fresh_database() -> None:
    if EXTERNAL:
        # Hosted databases rarely allow dropping a database; empty the schema instead.
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            await conn.execute("drop schema public cascade")
            await conn.execute("create schema public")
        finally:
            await conn.close()
    else:
        conn = await asyncpg.connect(f"{OWNER_SERVER}/postgres")
        try:
            await conn.execute("drop database if exists alyr_test with (force)")
            await conn.execute("create database alyr_test")
        finally:
            await conn.close()
    await migrate(OWNER_DSN, APP_DSN)


async def _clear_rate_hits() -> None:
    conn = await asyncpg.connect(OWNER_DSN)
    try:
        await conn.execute("delete from rate_hits")
        # A spent code still counts toward the five an email may ask for in an hour, and the
        # test database lives for the whole run: without this the back-office address signs in
        # in a dozen tests and the sixth one in the run is refused with a 429.
        await conn.execute("delete from login_codes where used")
    finally:
        await conn.close()


@pytest.fixture(scope="session", autouse=True)
def database():
    asyncio.run(_fresh_database())


@pytest.fixture
def client_factory(monkeypatch, tmp_path):
    """Build an app after the test has set any environment it needs."""
    monkeypatch.setenv("ALYR_ENV", "local")
    # Photos go to a folder of this test's own, never to R2 (ALY-103).
    for name in R2_SETTINGS:
        monkeypatch.setenv(name, "")
    monkeypatch.setenv("ALYR_MEDIA_LOCAL_DIR", str(tmp_path / "media"))
    monkeypatch.setenv("ALYR_DATABASE_URL", APP_DSN)
    monkeypatch.setenv("ALYR_MIGRATION_URL", OWNER_DSN)
    monkeypatch.setenv("ALYR_PUBLIC_WEB_URL", "http://web.test")
    monkeypatch.setenv("ALYR_META_APP_SECRET", APP_SECRET)
    monkeypatch.setenv("ALYR_META_VERIFY_TOKEN", VERIFY_TOKEN)
    monkeypatch.setenv("ALYR_META_PHONE_NUMBER_ID", NUMBER_ID)
    # The suite runs as if Meta had approved the three document templates (the tests of ALY-139
    # send through them). The tests of "not approved" (ALY-142) switch it off for themselves.
    monkeypatch.setenv("ALYR_DOCUMENT_TEMPLATES_APPROVED", "true")
    # Tests that place hundreds of orders from one address (the stress and property tests) must
    # not meet the limit a real address would; tests/test_rate_limits.py puts it back (ALY-116).
    from alyr.core import ratelimit

    monkeypatch.setattr(ratelimit, "PLACED_PER_ADDRESS", ratelimit.Limit(1_000_000, 600))
    stack = contextlib.ExitStack()

    def build() -> TestClient:
        get_settings.cache_clear()
        from alyr.main import create_app

        test_client = stack.enter_context(TestClient(create_app()))
        assert test_client.post("/sim/reset").status_code == 200
        # Each test starts with nobody counted against a rate limit (ALY-116).
        asyncio.run(_clear_rate_hits())
        return test_client

    yield build
    stack.close()
    get_settings.cache_clear()
    _forget_fastapi_route_caches()


def _forget_fastapi_route_caches() -> None:
    """FastAPI keeps module-level caches keyed by each endpoint function (4,096 entries each).
    `create_app` defines endpoints inside itself (`ready`, `health`...), and each holds its app, so
    every test's app, with its pools and engines, stayed alive for the whole run: 6 to 13 MB a
    test, enough to run CI's runner out of memory (ALY-313). Clearing them once the test's app is
    closed lets it go. Production runs one app per process, so it is not affected."""
    from fastapi.dependencies import models

    for name in ("_is_gen_callable_cached", "_is_async_gen_callable_cached",
                 "_is_coroutine_callable_cached"):
        cached = getattr(models, name, None)
        if cached is not None:
            cached.cache_clear()


@pytest.fixture
def client(client_factory):
    return client_factory()


# --- Sharding (CI only) -----------------------------------------------------------------------
# `ci` runs the suite as several jobs, each on its own runner with its own PostgreSQL, so that the
# whole run is as long as the slowest slice and not the sum (ALY-fc-ci). Without these options
# nothing here does anything: `pytest` on a laptop runs everything, as before.
#
#   pytest --shard=2/6 --shard-report=out.json
#
# A shard is a set of WHOLE test files, picked by weight (seconds per file from
# tests/shard_durations.json, kept by `scripts/ci/shards.py durations`; a file that is not in the
# list weighs the average, so a new test file is never left out). Whole files, never single
# tests, so the order inside a file, and every module-scoped fixture, is what it is on a laptop.
# The report says how many tests were collected, how many this shard chose and how many it ran;
# `scripts/ci/shards.py check` fails the `api` job unless the slices add up to the whole suite.

SHARD_DURATIONS = os.path.join(os.path.dirname(__file__), "shard_durations.json")


def pytest_addoption(parser):
    group = parser.getgroup("shard", "run one slice of the suite (CI)")
    group.addoption("--shard", default=None, metavar="I/N", help="run slice I of N (1-based)")
    group.addoption("--shard-report", default=None, metavar="FILE",
                    help="write what this slice collected, chose and ran, as JSON")


def shard_plan(weights: dict[str, float], total: int) -> list[list[str]]:
    """Split files into `total` slices, heaviest first onto the lightest slice (LPT), with ties
    broken by name so every job computes the same plan. Pure, so the CI script can test it."""
    slices: list[list[str]] = [[] for _ in range(total)]
    load = [0.0] * total
    for name in sorted(weights, key=lambda n: (-weights[n], n)):
        lightest = min(range(total), key=lambda i: (load[i], i))
        slices[lightest].append(name)
        load[lightest] += weights[name]
    return slices


# What this run collected, chose and ran, for the report. One process, so a plain dict will do.
_SHARD = {"collected": 0, "selected": 0, "ran": set(), "index": None, "total": None, "files": []}


def _rel(item, root: str) -> str:
    return os.path.relpath(str(item.path), root).replace(os.sep, "/")


def pytest_collection_modifyitems(config, items):
    import json
    import statistics

    _SHARD["collected"] = _SHARD["selected"] = len(items)
    spec = config.getoption("--shard")
    if not spec:
        return
    index, _, total = spec.partition("/")
    index, total = int(index), int(total)
    if not 1 <= index <= total:
        raise pytest.UsageError(f"--shard={spec}: need 1 <= I <= N")
    root = str(config.rootpath)
    files = sorted({_rel(item, root) for item in items})
    try:
        with open(SHARD_DURATIONS, encoding="utf-8") as handle:
            known = {k: float(v) for k, v in json.load(handle).items() if k in files}
    except (OSError, ValueError):
        known = {}
    fallback = statistics.mean(known.values()) if known else 1.0
    weights = {name: known.get(name, fallback) for name in files}
    mine = set(shard_plan(weights, total)[index - 1])
    chosen = [item for item in items if _rel(item, root) in mine]
    keep = {id(item) for item in chosen}
    config.hook.pytest_deselected(items=[item for item in items if id(item) not in keep])
    items[:] = chosen
    _SHARD.update(selected=len(chosen), index=index, total=total, files=sorted(mine))


def pytest_runtest_logreport(report):
    # A test counts as run when its call phase reported, or when its setup was skipped or failed
    # (then there is no call phase).
    if report.when == "call" or (report.when == "setup" and not report.passed):
        _SHARD["ran"].add(report.nodeid)


def pytest_sessionfinish(session):
    path = session.config.getoption("--shard-report")
    if not path:
        return
    import json

    report = {**_SHARD, "ran": len(_SHARD["ran"]), "exitstatus": int(session.exitstatus)}
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=1)
