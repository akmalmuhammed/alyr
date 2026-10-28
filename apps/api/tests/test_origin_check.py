"""A signed-in browser's changes must come from our own pages (ALY-118, core/origin.py), and
`/health` no longer says which environment this is."""

from alyr.config import Settings
from alyr.core import origin
from test_sign_in import sign_in

OURS = "http://web.test"
ELSEWHERE = "https://evil.example"


def signed_in_client(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    sign_in(client)
    return client


def test_a_change_from_another_website_is_refused_and_does_nothing(client_factory, monkeypatch):
    client = signed_in_client(client_factory, monkeypatch)
    refused = client.post("/api/auth/logout", headers={"Origin": ELSEWHERE})
    assert refused.status_code == 403
    # The session is still alive: the refused request never reached the route.
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout", headers={"Origin": OURS}).status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_requests_without_an_origin_or_without_the_cookie_pass(client_factory, monkeypatch):
    client = signed_in_client(client_factory, monkeypatch)
    # A script or a test sends no Origin.
    assert client.post("/api/auth/logout").status_code == 200
    # Nobody signed in: another site's page can ask for a sign-in code, which is open anyway.
    fresh = client_factory()
    posted = fresh.post(
        "/api/auth/code", json={"email": "someone@nowhere.example"}, headers={"Origin": ELSEWHERE}
    )
    assert posted.status_code == 200
    # Reading is never blocked.
    assert client_factory().get("/api/auth/me", headers={"Origin": ELSEWHERE}).status_code in (
        200, 401,
    )


def test_the_allowed_addresses_come_from_the_settings():
    prod = Settings(
        _env_file=None, env="production", public_web_url="https://app.alyr.qa/",
        allowed_origins="https://ops.alyr.qa, https://alyr-portal.example.workers.dev",
    )
    for good in ("https://app.alyr.qa", "https://ops.alyr.qa", "HTTPS://APP.ALYR.QA",
                 "https://alyr-portal.example.workers.dev"):
        assert origin.permitted(good, prod), good
    for bad in ("https://alyr.qa", "https://evil.example", "http://app.alyr.qa", "null",
                "https://app.alyr.qa.evil.example", "http://localhost:3100", ""):
        assert not origin.permitted(bad, prod), bad


def test_any_localhost_port_is_ours_on_a_developer_machine_only():
    local = Settings(_env_file=None, env="local", public_web_url="http://localhost:3100")
    assert origin.permitted("http://localhost:3101", local)
    assert origin.permitted("http://127.0.0.1:8000", local)
    assert origin.permitted("http://[::1]:3100", local)
    assert not origin.permitted("https://evil.example", local)
    assert not origin.permitted("http://localhost.evil.example", local)


def test_health_does_not_name_the_environment(client):
    assert client.get("/health").json() == {"status": "ok"}
