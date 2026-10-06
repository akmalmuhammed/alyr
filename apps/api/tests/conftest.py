import pytest
from fastapi.testclient import TestClient

from alyr.config import get_settings

APP_SECRET = "test-app-secret"
VERIFY_TOKEN = "test-verify-token"
NUMBER_ID = "100200300"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ALYR_META_APP_SECRET", APP_SECRET)
    monkeypatch.setenv("ALYR_META_VERIFY_TOKEN", VERIFY_TOKEN)
    monkeypatch.setenv("ALYR_META_PHONE_NUMBER_ID", NUMBER_ID)
    get_settings.cache_clear()
    from alyr.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client
    get_settings.cache_clear()
