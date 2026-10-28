"""The guard that stops a shop's webhook address aiming ALYR at its own network (ALY-142).

A server-side request forgery is the likeliest way a webhook feature hurts the company, so this
file tries every way in that came to mind: other schemes, credentials, addresses written as
numbers in every spelling, local names, ports, mixed or private DNS answers, a name that answers
public when the shop saves it and private when ALYR sends (rebinding), redirects, a huge answer
and a slow one. Where it matters the test also proves that no connection was made: a receiver
on this machine counts what reaches it.
"""

import asyncio
import ipaddress

import httpx
import pytest

from alyr.config import get_settings
from alyr.modules.connect import ssrf, webhooks
from connect_support import Receiver, connected_shop, rows, sale_body

PUBLIC = "93.184.216.34"


@pytest.fixture
def resolves(monkeypatch):
    """Decide what every name resolves to: `resolves({"hooks.shop.com": ["93.184.216.34"]})`."""
    table: dict[str, list[str]] = {}

    async def resolve(host: str, port: int) -> list[str]:
        if host not in table:
            raise OSError("name or service not known")
        return table[host]

    monkeypatch.setattr(ssrf, "resolve", resolve)
    return table


def blocked(url: str, **kw) -> str:
    with pytest.raises(ssrf.Blocked) as caught:
        ssrf.parse(url, **kw)
    return caught.value.reason


# ── the address as written ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize("url", [
    "http://hooks.shop.com/x", "ftp://hooks.shop.com/", "file:///etc/passwd",
    "gopher://hooks.shop.com/", "javascript:alert(1)", "//hooks.shop.com/", "hooks.shop.com",
    "", "https://", "https:///path", "data:text/plain;base64,AAAA",
])
def test_only_https_with_a_host_is_accepted(url):
    assert blocked(url) in ("scheme", "malformed")


@pytest.mark.parametrize("url", [
    "https://user:pass@hooks.shop.com/", "https://user@hooks.shop.com/",
    "https://hooks.shop.com@evil.example.org/", "https://hooks.shop.com:443@evil.org/",
])
def test_credentials_in_the_address_are_refused(url):
    assert blocked(url) == "credentials"


@pytest.mark.parametrize("url", [
    "https://127.0.0.1/", "https://127.1/", "https://2130706433/", "https://0x7f000001/",
    "https://0x7f.0.0.1/", "https://017700000001/", "https://0177.0.0.1/", "https://[::1]/",
    "https://[::ffff:127.0.0.1]/", "https://[::ffff:7f00:1]/", "https://0.0.0.0/",
    "https://0/", "https://192.168.1.1/", "https://10.0.0.1:8443/", "https://169.254.169.254/",
    "https://169.254.169.254:443/latest/meta-data/", "https://8.8.8.8/", "https://[2606:4700::1]/",
])
def test_an_address_written_as_numbers_is_refused_however_it_is_spelt(url):
    assert blocked(url) == "numeric_host"


@pytest.mark.parametrize("url", [
    "https://localhost/", "https://LOCALHOST./", "https://localhost.localdomain/",
    "https://app.localhost/", "https://printer.local/", "https://db.internal/",
    "https://router.home.arpa/", "https://intranet/", "https://service.lan/",
    "https://wiki.corp/", "https://fileserver.intranet/",
])
def test_names_that_mean_this_machine_or_a_private_network_are_refused(url):
    assert blocked(url) == "local_name"


@pytest.mark.parametrize("url", [
    "https://hooks.shop.com:22/", "https://hooks.shop.com:25/", "https://hooks.shop.com:80/",
    "https://hooks.shop.com:1023/",
])
def test_ports_below_1024_other_than_443_are_refused(url):
    assert blocked(url) == "port"


@pytest.mark.parametrize("url", [
    "https://hooks.shop.com/x y", "https://hooks.shop.com/\nHost: evil", "https://hooks.shop.com/\x00",
    "https://hooks.shop.com/#frag", "https://hooks.shop.com/" + "a" * 600,
])
def test_whitespace_control_characters_fragments_and_length_are_refused(url):
    assert blocked(url) == "malformed"


@pytest.mark.parametrize("url", [
    "https://hooks.shop.com/alyr", "https://hooks.shop.com:443/alyr?token=abc",
    "https://hooks.shop.com:8443/", "https://hooks.shop.com:9000/a/b?x=1&y=2",
    "https://pos.my-shop.qa/webhooks/alyr",
])
def test_a_good_address_is_accepted(url):
    assert ssrf.parse(url).scheme == "https"


def test_a_developer_machine_may_send_to_itself_only_when_told_to():
    assert ssrf.parse("http://127.0.0.1:8123/hook", allow_local=True).host == "127.0.0.1"
    assert ssrf.parse("http://localhost:8123/hook", allow_local=True).port == 8123
    assert blocked("http://127.0.0.1:8123/hook") == "scheme"
    assert blocked("https://127.0.0.1:8123/hook") == "numeric_host"


def test_the_local_switch_is_read_only_on_a_local_machine(monkeypatch):
    monkeypatch.setenv("ALYR_WEBHOOK_ALLOW_LOCAL", "true")
    monkeypatch.setenv("ALYR_ENV", "production")
    get_settings.cache_clear()
    try:
        assert webhooks.allow_local() is False
        monkeypatch.setenv("ALYR_ENV", "local")
        get_settings.cache_clear()
        assert webhooks.allow_local() is True
    finally:
        get_settings.cache_clear()


# ── the address the name leads to ────────────────────────────────────────────────────────


@pytest.mark.parametrize("ip", [
    "127.0.0.1", "127.255.255.254", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255",
    "192.168.0.1", "169.254.169.254", "169.254.0.1", "100.64.0.1", "100.127.255.254",
    "0.0.0.0", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255", "198.18.0.1",
    "192.0.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1", "::1", "::", "fe80::1",
    "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "::ffff:169.254.169.254", "64:ff9b::7f00:1", "64:ff9b::a00:1", "2002:7f00:1::",
    "2002:a9fe:a9fe::", "2001:0:4136:e378:8000:63bf:3fff:fdd2",
])
def test_an_address_that_is_not_public_is_not_public(ip):
    assert ssrf.address_is_public(ipaddress.ip_address(ip)) is False, ip


@pytest.mark.parametrize("ip", ["8.8.8.8", "1.1.1.1", PUBLIC, "151.101.1.69",
                                "2606:4700:4700::1111", "2a00:1450:4001:81b::200e"])
def test_a_public_address_is_public(ip):
    assert ssrf.address_is_public(ipaddress.ip_address(ip)) is True, ip


def run(coro):
    return asyncio.run(coro)


def test_a_name_must_resolve_and_every_answer_must_be_public(resolves):
    resolves["ok.shop.com"] = [PUBLIC]
    target, ip = run(ssrf.vet("https://ok.shop.com/hook"))
    assert (target.host, ip) == ("ok.shop.com", PUBLIC)
    resolves["mixed.shop.com"] = [PUBLIC, "10.0.0.5"]  # one private record spoils the name
    with pytest.raises(ssrf.Blocked) as caught:
        run(ssrf.vet("https://mixed.shop.com/hook"))
    assert caught.value.reason == "address"
    for name, answer in (("meta.shop.com", ["169.254.169.254"]), ("loop.shop.com", ["127.0.0.1"]),
                         ("v6.shop.com", ["::1"]), ("mapped.shop.com", ["::ffff:10.1.1.1"]),
                         ("cgnat.shop.com", ["100.64.0.9"])):
        resolves[name] = answer
        with pytest.raises(ssrf.Blocked):
            run(ssrf.vet(f"https://{name}/hook"))
    with pytest.raises(ssrf.Blocked) as caught:
        run(ssrf.vet("https://nowhere.shop.com/hook"))
    assert caught.value.reason == "unresolved"
    resolves["empty.shop.com"] = []
    with pytest.raises(ssrf.Blocked) as caught:
        run(ssrf.vet("https://empty.shop.com/hook"))
    assert caught.value.reason == "unresolved"


# ── sending ──────────────────────────────────────────────────────────────────────────────


class Recorder:
    """A pretend network: records every request and answers as told."""

    def __init__(self, handler=None) -> None:
        self.requests: list[httpx.Request] = []
        self.handler = handler or (lambda request: httpx.Response(200, text="ok"))

    def transport(self) -> httpx.MockTransport:
        async def handle(request: httpx.Request) -> httpx.Response:
            self.requests.append(request)
            result = self.handler(request)
            return await result if asyncio.iscoroutine(result) else result

        return httpx.MockTransport(handle)


def test_alyr_connects_to_the_address_it_checked_and_says_who_it_wants(resolves):
    resolves["hooks.shop.com"] = [PUBLIC]
    net = Recorder()
    answer = run(ssrf.post("https://hooks.shop.com/alyr?x=1", b'{"a":1}',
                           {"X-Test": "1"}, transport=net.transport()))
    assert (answer.status, answer.snippet) == (200, "ok")
    [request] = net.requests
    assert request.url.host == PUBLIC          # the checked address, not a second look-up
    assert request.headers["host"] == "hooks.shop.com"
    assert request.extensions["sni_hostname"] == "hooks.shop.com"
    assert str(request.url.path) == "/alyr" and request.url.query == b"x=1"
    assert request.read() == b'{"a":1}' and request.headers["x-test"] == "1"


def test_a_redirect_is_returned_and_never_followed(resolves):
    resolves["hooks.shop.com"] = [PUBLIC]
    net = Recorder(lambda r: httpx.Response(
        302, headers={"Location": "http://169.254.169.254/latest/meta-data/"}))
    answer = run(ssrf.post("https://hooks.shop.com/x", b"{}", {}, transport=net.transport()))
    assert answer.status == 302
    assert len(net.requests) == 1  # nothing asked for the address it pointed at


def test_a_huge_answer_is_cut_to_a_snippet(resolves):
    resolves["hooks.shop.com"] = [PUBLIC]
    net = Recorder(lambda r: httpx.Response(200, content=b"A" * (4 * 1024 * 1024)))
    answer = run(ssrf.post("https://hooks.shop.com/x", b"{}", {}, transport=net.transport()))
    assert len(answer.snippet) <= ssrf.SNIPPET_CHARS


def test_an_answer_is_made_safe_to_show(resolves):
    resolves["hooks.shop.com"] = [PUBLIC]
    net = Recorder(lambda r: httpx.Response(500, content=b"bad\x00\x07 \xff news\n\nnow"))
    answer = run(ssrf.post("https://hooks.shop.com/x", b"{}", {}, transport=net.transport()))
    assert "\x00" not in answer.snippet and "\x07" not in answer.snippet
    assert "\n" not in answer.snippet


def test_a_receiver_that_never_answers_is_given_up_on(resolves, monkeypatch):
    resolves["hooks.shop.com"] = [PUBLIC]
    monkeypatch.setattr(ssrf, "TOTAL_SECONDS", 0.2)

    async def slow(request):
        await asyncio.sleep(2)
        return httpx.Response(200)

    net = Recorder(slow)
    with pytest.raises(TimeoutError):
        run(ssrf.post("https://hooks.shop.com/x", b"{}", {}, transport=net.transport()))


def test_nothing_is_sent_to_a_private_address_however_it_is_reached(resolves):
    net = Recorder()
    for url, answer in (("https://rebind.shop.com/x", ["127.0.0.1"]),
                        ("https://meta.shop.com/x", ["169.254.169.254"]),
                        ("https://lan.shop.com/x", ["192.168.1.20"])):
        resolves[url.split("/")[2]] = answer
        with pytest.raises(ssrf.Blocked):
            run(ssrf.post(url, b"{}", {}, transport=net.transport()))
    for url in ("http://127.0.0.1/x", "https://127.0.0.1/x", "https://localhost/x",
                "https://[::1]/x", "https://2130706433/x", "ftp://shop.com/x"):
        with pytest.raises(ssrf.Blocked):
            run(ssrf.post(url, b"{}", {}, transport=net.transport()))
    assert net.requests == []


def test_a_real_receiver_on_this_machine_is_never_reached_through_a_name(resolves):
    """The strongest form: a real server counts what arrives. A name that points at it is
    refused before any connection; a plain address to it is refused outright."""
    receiver = Receiver()
    try:
        port = receiver.server.server_address[1]
        resolves["sneaky.shop.com"] = ["127.0.0.1"]
        with pytest.raises(ssrf.Blocked):
            run(ssrf.post(f"https://sneaky.shop.com:{max(port, 1024)}/hook", b"{}", {}))
        with pytest.raises(ssrf.Blocked):
            run(ssrf.post(f"http://127.0.0.1:{port}/hook", b"{}", {}))
        with pytest.raises(ssrf.Blocked):
            run(ssrf.post(f"https://localhost:{max(port, 1024)}/hook", b"{}", {}))
        assert receiver.requests == []
    finally:
        receiver.stop()


# ── what a shop is told when it saves an address ─────────────────────────────────────────


@pytest.fixture
def shop(client_factory, monkeypatch):
    return connected_shop(client_factory, monkeypatch)


@pytest.mark.parametrize("url, code", [
    ("http://hooks.shop.com/x", "webhook_url_invalid"),
    ("https://127.0.0.1/x", "webhook_url_blocked"),
    ("https://localhost/x", "webhook_url_blocked"),
    ("https://169.254.169.254/latest/meta-data/", "webhook_url_blocked"),
    ("https://user:pw@hooks.shop.com/x", "webhook_url_invalid"),
    ("https://rebind.shop.com/x", "webhook_url_blocked"),
    ("https://nowhere.shop.com/x", "webhook_url_unresolved"),
])
def test_a_shop_saving_a_bad_address_is_told_why_in_both_languages(shop, resolves, url, code):
    resolves["hooks.shop.com"] = [PUBLIC]
    resolves["rebind.shop.com"] = ["10.0.0.9"]
    answer = shop.owner.post("/api/connect-setup/webhooks",
                             json={"url": url, "events": ["document.issued"]})
    assert answer.status_code == 422, answer.text
    assert answer.json()["code"] == code and answer.json()["message_ar"]
    machine = shop.machine.post("/api/connect/webhooks", headers=shop.headers(),
                                json={"url": url, "events": ["document.issued"]})
    assert machine.status_code == 422 and machine.json()["code"] == code
    assert rows("select count(*) as n from webhook_endpoints where tenant_id = $1",
                shop.tenant_id)[0]["n"] == 0


def test_a_good_address_is_saved(shop, resolves):
    resolves["hooks.shop.com"] = [PUBLIC]
    answer = shop.owner.post("/api/connect-setup/webhooks", json={
        "url": "https://hooks.shop.com/alyr", "events": ["document.issued"]})
    assert answer.status_code == 201, answer.text


def test_an_address_that_turns_private_after_it_was_saved_is_refused_at_send_time(
        shop, resolves):
    """DNS re-check at send time: the name was public when it was saved and private when ALYR
    sends. Nothing is connected to; the log says why; the sale itself is untouched."""
    resolves["hooks.shop.com"] = [PUBLIC]
    made = shop.owner.post("/api/connect-setup/webhooks", json={
        "url": "https://hooks.shop.com/alyr", "events": ["document.issued"]}).json()
    net = Recorder()
    shop.machine.app.state.webhooks.transport = net.transport()
    resolves["hooks.shop.com"] = ["169.254.169.254"]  # the name now points inside
    sold = shop.post_sale(sale_body("S-1"), "idem-ssrf-0001")
    assert sold.status_code == 201  # a failing webhook never fails a sale
    [row] = shop.owner.get(
        f"/api/connect-setup/webhooks/{made['webhook']['id']}/deliveries").json()["deliveries"]
    assert row["status"] == "pending" and row["attempts"] == 1
    assert row["error"] == "address refused: address" and row["response_status"] is None
    assert net.requests == []
    # And once it points somewhere public again, the retry goes through.
    resolves["hooks.shop.com"] = [PUBLIC]
    shop.machine.app.state.webhooks.transport = net.transport()
    from connect_support import push_due_webhooks

    push_due_webhooks(shop)
    assert len(net.requests) == 1
    assert net.requests[0].url.host == PUBLIC
