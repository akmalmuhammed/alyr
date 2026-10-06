import asyncio
import os

import asyncpg
import pytest
from fastapi.testclient import TestClient

from alyr.config import get_settings
from alyr.migrate import migrate

APP_SECRET = "test-app-secret"
VERIFY_TOKEN = "test-verify-token"
NUMBER_ID = "100200300"

HOST = os.environ.get("ALYR_TEST_DB_HOST", "localhost:5432")
OWNER_SERVER = f"postgresql://alyr:alyr_local@{HOST}"
OWNER_DSN = f"{OWNER_SERVER}/alyr_test"
APP_DSN = f"postgresql://alyr_app:alyr_app_local@{HOST}/alyr_test"


async def _fresh_database() -> None:
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
def client(monkeypatch):
    monkeypatch.setenv("ALYR_ENV", "local")
    monkeypatch.setenv("ALYR_DATABASE_URL", APP_DSN)
    monkeypatch.setenv("ALYR_MIGRATION_URL", OWNER_DSN)
    monkeypatch.setenv("ALYR_PUBLIC_WEB_URL", "http://web.test")
    monkeypatch.setenv("ALYR_META_APP_SECRET", APP_SECRET)
    monkeypatch.setenv("ALYR_META_VERIFY_TOKEN", VERIFY_TOKEN)
    monkeypatch.setenv("ALYR_META_PHONE_NUMBER_ID", NUMBER_ID)
    get_settings.cache_clear()
    from alyr.main import create_app

    with TestClient(create_app()) as test_client:
        assert test_client.post("/sim/reset").status_code == 200
        yield test_client
    get_settings.cache_clear()
