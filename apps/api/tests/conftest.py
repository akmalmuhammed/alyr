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
    stack = contextlib.ExitStack()

    def build() -> TestClient:
        get_settings.cache_clear()
        from alyr.main import create_app

        test_client = stack.enter_context(TestClient(create_app()))
        assert test_client.post("/sim/reset").status_code == 200
        return test_client

    yield build
    stack.close()
    get_settings.cache_clear()


@pytest.fixture
def client(client_factory):
    return client_factory()
