"""Rate limits on the open doors (ALY-116): sign-in codes, code guesses, sign-up, and orders
and bookings from a customer's page. Counted in `rate_hits` by a hash, never by the raw value."""

from types import SimpleNamespace

from alyr.config import Settings
from alyr.core import ratelimit
from alyr.seed import AGENT_EMAIL, OWNER_EMAIL
from test_consent import owner_sql

EVERYONE = "x-test-address"


def ask(client, email, address=None):
    headers = {EVERYONE: address} if address else {}
    return client.post("/api/auth/code", json={"email": email}, headers=headers)


def test_an_unknown_email_is_refused_after_five_asks_just_like_a_known_one(client):
    for _ in range(5):
        assert ask(client, "nobody@nowhere.example").status_code == 200
    refused = ask(client, "nobody@nowhere.example")
    assert refused.status_code == 429
    # The answer for a real account is the same, so the form teaches nobody who has one.
    owner_sql("delete from login_codes where email = $1", AGENT_EMAIL)
    for _ in range(5):
        assert ask(client, AGENT_EMAIL).status_code == 200
    known = ask(client, AGENT_EMAIL)
    assert (known.status_code, known.json()) == (429, refused.json())


def test_a_refusal_says_when_to_come_back(client):
    for _ in range(5):
        ask(client, "slow@nowhere.example")
    refused = ask(client, "slow@nowhere.example")
    assert refused.status_code == 429
    assert 1 <= int(refused.headers["retry-after"]) <= 3600


def test_one_address_cannot_ask_for_codes_for_everyone(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_CLIENT_IP_HEADER", EVERYONE)
    client = client_factory()
    for n in range(ratelimit.CODES_PER_ADDRESS.count):
        assert ask(client, f"flood{n}@nowhere.example", "203.0.113.7").status_code == 200
    assert ask(client, "one-more@nowhere.example", "203.0.113.7").status_code == 429
    # Somebody else, from another address, is not held up by it.
    assert ask(client, "one-more@nowhere.example", "203.0.113.8").status_code == 200


def test_sign_up_codes_count_the_same_way(client):
    for _ in range(5):
        assert client.post("/api/onboarding/code", json={"email": "new@nowhere.example"}
                           ).status_code == 200
    assert client.post("/api/onboarding/code", json={"email": "new@nowhere.example"}
                       ).status_code == 429


def test_one_address_cannot_guess_codes_without_end(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_CLIENT_IP_HEADER", EVERYONE)
    client = client_factory()
    wrong = {"email": OWNER_EMAIL, "code": "000000"}
    for _ in range(ratelimit.GUESSES_PER_ADDRESS.count):
        sent = client.post("/api/auth/verify", json=wrong, headers={EVERYONE: "198.51.100.9"})
        assert sent.status_code == 401
    stopped = client.post("/api/auth/verify", json=wrong, headers={EVERYONE: "198.51.100.9"})
    assert stopped.status_code == 429
    other = client.post("/api/auth/verify", json=wrong, headers={EVERYONE: "198.51.100.10"})
    assert other.status_code == 401


def test_a_refused_request_is_not_counted_and_the_window_lets_people_back_in(client):
    for _ in range(5):
        ask(client, "later@nowhere.example")
    assert ask(client, "later@nowhere.example").status_code == 429
    assert owner_sql("select count(*) as n from rate_hits where bucket = 'code-email'")[0]["n"] == 5
    owner_sql("update rate_hits set at = now() - interval '2 hours'")
    owner_sql("delete from login_codes where email = 'later@nowhere.example'")
    assert ask(client, "later@nowhere.example").status_code == 200


def test_the_table_keeps_hashes_not_emails_or_addresses(client):
    ask(client, "private@nowhere.example")
    keys = [r["key"] for r in owner_sql("select key from rate_hits")]
    assert keys and all(len(k) == 64 and "@" not in k and "." not in k for k in keys)


def test_orders_and_bookings_from_one_address_are_limited(client, monkeypatch):
    # The harness lifts this limit for every other test; here it is the real one.
    monkeypatch.setattr(ratelimit, "PLACED_PER_ADDRESS", ratelimit.Limit(30, 600))
    limit = ratelimit.PLACED_PER_ADDRESS.count
    for path in ("/api/store/al-noor/orders", "/api/book/al-noor"):
        for _ in range(limit):
            # No link, so the order itself is refused; the door still counts the knock.
            assert client.post(path, json={"items": [], "token": "x"}).status_code != 429
        assert client.post(path, json={"items": [], "token": "x"}).status_code == 429


def test_the_address_is_read_only_where_the_settings_say_so():
    def request(header_value, peer="10.0.0.5"):
        return SimpleNamespace(
            headers={"x-forwarded-for": header_value} if header_value else {},
            client=SimpleNamespace(host=peer),
        )

    off = SimpleNamespace(client_ip_header="", client_ip_proxies=1)
    on = SimpleNamespace(client_ip_header="X-Forwarded-For", client_ip_proxies=1)
    two = SimpleNamespace(client_ip_header="x-forwarded-for", client_ip_proxies=2)
    spoofed = request("1.1.1.1, 203.0.113.7")
    # Nothing is read from a header nobody named: a visitor cannot pick their own address.
    assert ratelimit.client_address(spoofed, off) == "10.0.0.5"
    # With one proxy of ours, the last entry is the one our proxy wrote, not the visitor.
    assert ratelimit.client_address(spoofed, on) == "203.0.113.7"
    assert ratelimit.client_address(spoofed, two) == "1.1.1.1"
    assert ratelimit.client_address(request(""), on) == "10.0.0.5"


def test_per_address_limits_wait_for_a_real_address_outside_a_developer_machine():
    # Behind our own proxies every visitor could be one address; counting it would lock everyone
    # out. The per-email limits are not in question here and are always on.
    assert ratelimit.address_limits_on(Settings(_env_file=None, env="local"))
    assert not ratelimit.address_limits_on(Settings(_env_file=None, env="production"))
    assert ratelimit.address_limits_on(
        Settings(_env_file=None, env="production", client_ip_header="cf-connecting-ip")
    )
    assert not ratelimit.address_limits_on(
        Settings(_env_file=None, env="production", client_ip_header="  ")
    )
