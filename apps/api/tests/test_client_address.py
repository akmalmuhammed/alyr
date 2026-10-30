"""Which address a request is counted under, and who may say so (ALY-265, on top of ALY-116).

In production the API sits behind our own edge (a Cloudflare Worker), but its Cloud Run address is
public. So the edge writes the visitor's address and signs it, and the API believes an address
only with a signature made with a key it holds. Everything else is counted in one shared bucket,
so a caller who skips the edge can neither choose their own address nor use somebody else's."""

import logging
from types import SimpleNamespace

import pytest

from alyr.config import Settings
from alyr.core import ratelimit
from test_consent import owner_sql
from test_onboarding import new_business

HEADER = "x-alyr-client-ip"
SIG = "x-alyr-client-ip-sig"
KEY = "alyr-test-key"
OTHER_KEY = "another-key"

# The same three signatures are asserted by the edge Worker's own tests
# (infra/cloudflare/edge/test/edge.test.mjs): if one side changes how it signs, both fail.
GOLDEN = {
    (KEY, "203.0.113.7"): "928601c79d494c6b8eca820cc396164a9432707a43b853b936bda83025c1d613",
    (KEY, "2001:db8::1"): "76abbbc7c69d3e992c0d6832572df308e8c5b1416012d34f84f26729c09ba3d3",
    (OTHER_KEY, "203.0.113.7"): "5e8dad3e88c7e918d354ca8fb959a4406cbc6af3825e26917d1a9807dcaa4b63",
}


def signed(address, key=KEY):
    """The two headers the edge writes."""
    return {HEADER: address, SIG: ratelimit.sign(key, address)}


@pytest.fixture
def behind_the_edge(client_factory, monkeypatch):
    """An API that believes only an address the edge signed."""
    monkeypatch.setenv("ALYR_CLIENT_IP_HEADER", HEADER)
    monkeypatch.setenv("ALYR_CLIENT_IP_KEYS", KEY)
    return client_factory()


def ask(client, email, headers=None):
    return client.post("/api/auth/code", json={"email": email}, headers=headers or {})


def seen(client, headers=None):
    answer = client.get("/api/client-address", headers=headers or {})
    assert answer.status_code == 200
    return answer.json()


def request_with(headers, peer="10.0.0.5"):
    return SimpleNamespace(
        headers={k.lower(): v for k, v in headers.items()}, client=SimpleNamespace(host=peer)
    )


def settings():
    return SimpleNamespace(
        env="production", client_ip_header=HEADER, client_ip_proxies=1, client_ip_keys=KEY
    )


# --------------------------------------------------------------- the signature itself

def test_the_signature_matches_the_edge_workers_on_known_values():
    for (key, address), expected in GOLDEN.items():
        assert ratelimit.sign(key, address) == expected
    # A key pasted or piped with a newline on it still signs the same.
    assert ratelimit.sign(KEY + "\r\n", "203.0.113.7") == GOLDEN[(KEY, "203.0.113.7")]


# ------------------------------------------------------------- what the API believes

def test_a_signed_address_is_the_address():
    me = request_with(signed("203.0.113.7"))
    assert ratelimit.resolve(me, settings()) == ("203.0.113.7", ratelimit.SIGNED)
    v6 = request_with(signed("2001:db8::1"))
    assert ratelimit.resolve(v6, settings()) == ("2001:db8::1", ratelimit.SIGNED)


def test_nothing_else_is_believed_when_keys_are_set():
    lone = settings()
    cases = {
        "no header at all": {},
        "an address nobody signed": {HEADER: "203.0.113.7"},
        "a signature with no address": {SIG: ratelimit.sign(KEY, "203.0.113.7")},
        "a signature of another key": signed("203.0.113.7", OTHER_KEY),
        "a signature of another address": {
            HEADER: "198.51.100.1", SIG: ratelimit.sign(KEY, "203.0.113.7"),
        },
        "a made-up signature": {HEADER: "203.0.113.7", SIG: "0" * 64},
        "a signature that is not text we can read": {HEADER: "203.0.113.7", SIG: "é" * 64},
        "a signed value that is not an address": signed("not-an-address"),
        "a signed list instead of one address": signed("203.0.113.7, 198.51.100.1"),
        "a forwarded-for list": {"x-forwarded-for": "203.0.113.7"},
    }
    for what, headers in cases.items():
        answer = ratelimit.resolve(request_with(headers), lone)
        assert answer == (ratelimit.UNVOUCHED, ratelimit.UNVOUCHED), what


def test_the_connection_is_never_the_answer_once_a_header_is_named():
    # uvicorn runs with --forwarded-allow-ips '*', so `request.client` is the first
    # X-Forwarded-For entry: whatever the caller wrote. It must not stand in for the address.
    me = request_with({"x-forwarded-for": "6.6.6.6, 203.0.113.7"}, peer="6.6.6.6")
    assert ratelimit.client_address(me, settings()) == ratelimit.UNVOUCHED


def test_a_second_key_is_accepted_while_a_key_is_being_replaced():
    both = settings()
    both.client_ip_keys = f"{OTHER_KEY}, {KEY}\n"
    def source(key):
        return ratelimit.resolve(request_with(signed("203.0.113.7", key)), both)[1]

    assert source(KEY) == ratelimit.SIGNED and source(OTHER_KEY) == ratelimit.SIGNED
    assert source("a-key-nobody-holds") == ratelimit.UNVOUCHED
    # Once the old key is dropped, what it signed stops counting.
    both.client_ip_keys = OTHER_KEY
    assert source(KEY) == ratelimit.UNVOUCHED


def test_without_keys_the_named_header_is_believed_as_before():
    def named(header, keys):
        return SimpleNamespace(client_ip_header=header, client_ip_proxies=1, client_ip_keys=keys)

    me = request_with({"x-forwarded-for": "1.1.1.1, 203.0.113.7"})
    assert ratelimit.resolve(me, named("x-forwarded-for", "")) == ("203.0.113.7", ratelimit.HEADER)
    none = named("", KEY)
    assert ratelimit.resolve(me, none) == ("10.0.0.5", ratelimit.CONNECTION)


def test_a_refusal_is_noted_in_the_log_but_not_every_time(caplog, monkeypatch):
    monkeypatch.setattr(ratelimit, "_warned_at", float("-inf"))
    forged = request_with({HEADER: "203.0.113.7", SIG: "0" * 64})
    with caplog.at_level(logging.WARNING, logger="alyr.ratelimit"):
        for _ in range(5):
            ratelimit.resolve(forged, settings())
        # Somebody who sent nothing at all is not worth a line.
        ratelimit.resolve(request_with({}), settings())
    lines = [r for r in caplog.records if "client address refused" in r.getMessage()]
    assert len(lines) == 1
    assert "203.0.113.7" not in lines[0].getMessage()


def test_the_start_up_log_says_what_is_wrong():
    def notes(**over):
        return ratelimit.startup_notes(Settings(_env_file=None, **over))

    assert "per-address rate limits are off" in notes(env="production")[0]
    assert "believed without ALYR_CLIENT_IP_KEYS" in notes(
        env="production", client_ip_header=HEADER
    )[0]
    assert notes(env="production", client_ip_header=HEADER, client_ip_keys=KEY) == []
    # A developer machine counts addresses by default and has no edge to sign anything.
    assert notes(env="local") == []


# ------------------------------------------------------------------- through the API

def test_each_signed_visitor_has_a_count_of_their_own(behind_the_edge):
    limit = ratelimit.CODES_PER_ADDRESS.count
    mine = signed("203.0.113.7")
    for n in range(limit):
        assert ask(behind_the_edge, f"a{n}@nowhere.example", mine).status_code == 200
    assert ask(behind_the_edge, "z@nowhere.example", mine).status_code == 429
    assert ask(behind_the_edge, "z@nowhere.example", signed("203.0.113.8")).status_code == 200


def test_a_caller_who_skips_the_edge_cannot_pick_an_address(behind_the_edge):
    """A fresh made-up address on every request would be a fresh allowance on every request."""
    limit = ratelimit.CODES_PER_ADDRESS.count
    for n in range(limit):
        forged = {HEADER: f"198.51.100.{n + 1}", SIG: "0" * 64}
        assert ask(behind_the_edge, f"f{n}@nowhere.example", forged).status_code == 200
    assert ask(behind_the_edge, "f-more@nowhere.example", {HEADER: "198.51.100.200"}
               ).status_code == 429
    # Nor does writing X-Forwarded-For help: that is not read.
    assert ask(behind_the_edge, "f-more@nowhere.example", {"x-forwarded-for": "198.51.100.201"}
               ).status_code == 429


def test_a_caller_cannot_lock_out_somebody_by_using_their_address(behind_the_edge):
    victim = "203.0.113.50"
    for n in range(ratelimit.CODES_PER_ADDRESS.count + 5):
        # Their address, no signature (or the signature of a different address).
        headers = {HEADER: victim} if n % 2 else {HEADER: victim, SIG: signed("203.0.113.51")[SIG]}
        ask(behind_the_edge, f"l{n}@nowhere.example", headers)
    assert ask(behind_the_edge, "l-last@nowhere.example", {HEADER: victim}).status_code == 429
    # The victim, through the edge, is not held up by any of it.
    assert ask(behind_the_edge, "victim@nowhere.example", signed(victim)).status_code == 200


def test_guesses_are_counted_per_signed_address_too(behind_the_edge):
    wrong = {"email": "nobody@nowhere.example", "code": "000000"}
    mine = signed("198.51.100.9")
    for _ in range(ratelimit.GUESSES_PER_ADDRESS.count):
        assert behind_the_edge.post("/api/auth/verify", json=wrong, headers=mine).status_code == 401
    assert behind_the_edge.post("/api/auth/verify", json=wrong, headers=mine).status_code == 429
    other = behind_the_edge.post("/api/auth/verify", json=wrong, headers=signed("198.51.100.10"))
    assert other.status_code == 401


def test_the_hash_kept_for_a_signed_address_is_of_the_address_not_the_signature(behind_the_edge):
    ask(behind_the_edge, "h@nowhere.example", signed("203.0.113.7"))
    keys = {r["key"] for r in owner_sql("select key from rate_hits where bucket = 'code-address'")}
    assert keys == {ratelimit._digest("203.0.113.7")}


def test_the_check_route_says_what_the_api_sees(behind_the_edge):
    mine = seen(behind_the_edge, signed("203.0.113.7"))
    assert mine == {"address": "203.0.113.7", "source": "signed", "counting": True}
    forged = seen(behind_the_edge, {HEADER: "203.0.113.7", SIG: "0" * 64})
    assert forged == {"address": "unvouched", "source": "unvouched", "counting": True}
    assert seen(behind_the_edge)["source"] == "unvouched"
    # Nothing about it is kept by a browser or a proxy.
    answer = behind_the_edge.get("/api/client-address", headers=signed("203.0.113.7"))
    assert answer.headers["cache-control"] == "no-store"


def test_the_check_route_in_the_settings_before_and_after(client_factory, monkeypatch):
    # Nothing named: the connection, and on a developer machine the limits are counted.
    assert seen(client_factory())["source"] == "connection"
    # A header believed as it stands, the way the interim host ran.
    monkeypatch.setenv("ALYR_CLIENT_IP_HEADER", HEADER)
    plain = client_factory()
    assert seen(plain, {HEADER: "203.0.113.7"}) == {
        "address": "203.0.113.7", "source": "header", "counting": True,
    }


# ----------------------------------------------- the address written on an acceptance

def test_the_terms_acceptance_records_the_signed_address(behind_the_edge):
    behind_the_edge.headers.update(signed("203.0.113.77"))
    tenant, _, _ = new_business(behind_the_edge)
    rows = owner_sql("select ip from terms_acceptances where tenant_id = $1", tenant)
    assert [r["ip"] for r in rows] == ["203.0.113.77"]


def test_a_forged_address_is_not_what_an_acceptance_records(behind_the_edge):
    behind_the_edge.headers.update({HEADER: "203.0.113.77", "x-forwarded-for": "6.6.6.6"})
    tenant, _, _ = new_business(behind_the_edge)
    rows = owner_sql("select ip from terms_acceptances where tenant_id = $1", tenant)
    assert [r["ip"] for r in rows] == [ratelimit.UNVOUCHED]
