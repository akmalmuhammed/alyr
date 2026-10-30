"""Settings fail safe (ALY-114): anything that is not explicitly "local" closes the
developer conveniences instead of opening them."""

import pytest

from alyr.config import Settings
from alyr.seed import DEMO_SLUG


def test_the_default_environment_is_production(monkeypatch):
    monkeypatch.delenv("ALYR_ENV", raising=False)
    assert Settings(_env_file=None).env == "production"


@pytest.mark.parametrize("env", ["staging", "prod", "Local", ""])
def test_outside_local_the_simulator_payments_and_api_docs_are_gone(
    client_factory, monkeypatch, env
):
    monkeypatch.setenv("ALYR_ENV", env)
    from fastapi.testclient import TestClient

    from alyr.config import get_settings
    from alyr.main import create_app

    get_settings.cache_clear()
    client = TestClient(create_app())
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
    assert client.post("/sim/reset").status_code == 404
    paid = client.post(f"/api/pay/{DEMO_SLUG}/complete", headers={"x-order-link": "x.y"})
    assert paid.status_code == 404
    # Without the open demo, the workspace needs a session.
    assert client.get("/api/workspace").status_code == 401


def test_the_webhook_verify_token_must_match_exactly(client_factory, monkeypatch):
    client = client_factory()
    params = {"hub.mode": "subscribe", "hub.challenge": "42"}
    assert (
        client.get(
            "/webhooks/whatsapp", params={**params, "hub.verify_token": "test-verify-token"}
        ).text
        == "42"
    )
    wrong = client.get(
        "/webhooks/whatsapp", params={**params, "hub.verify_token": "test-verify-tokenX"}
    )
    assert wrong.status_code == 403
