"""Sending a webhook without letting a shop's address aim ALYR at its own network (ALY-142).

A shop gives ALYR an address and ALYR posts to it from inside its own network. That is exactly
the shape of a server-side request forgery: the address could be `http://169.254.169.254/` (a
cloud machine's secrets), `http://localhost:5432/` (the database), a name that quietly points at
a private address, or an address that answers with a redirect to one of those. Every rule below
exists for one of those, and `tests/test_connect_ssrf.py` tries each.

* **https only**, with a domain name. No `http://`, no address written as numbers (`127.0.0.1`,
  `2130706433`, `0x7f.1`, `[::1]`), no user name or password in the address, and names that are
  local by definition (`localhost`, `*.local`, `*.internal`, a name without a dot) are refused.
* **The address is looked up each time ALYR sends**, not only when the shop saves it, and every
  address the name gives must be a public one. A name that pointed somewhere public yesterday and
  somewhere private today is refused today.
* **ALYR connects to the address it checked.** The connection goes to that IP, with the shop's
  name in the `Host` header and in the TLS handshake, so the name cannot be looked up a second
  time and answer differently (DNS rebinding), and the certificate is still checked against the
  name.
* **Redirects are never followed.** A 3xx is a failed delivery: the shop must answer at the
  address it gave, so a redirect cannot carry ALYR to an address that was not checked.
* **Short and small.** Three seconds to connect, ten in all, and at most 2 KB of the answer is
  read; the rest is not.
* **No proxy from the environment.**

A developer machine can send to itself: with `ALYR_ENV=local` and `ALYR_WEBHOOK_ALLOW_LOCAL=true`
(both), `http://` and local addresses are allowed, so a test can run a receiver on 127.0.0.1.
Production refuses to start from that setting alone, because `local` is the only environment
that reads it.
"""

import asyncio
import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx

CONNECT_SECONDS = 3.0
TOTAL_SECONDS = 10.0
MAX_ANSWER_BYTES = 2048
SNIPPET_CHARS = 500
MAX_URL_CHARS = 500

# Names that mean "this machine" or "this network" whatever an address book says.
LOCAL_SUFFIXES = (".localhost", ".local", ".internal", ".localdomain", ".home.arpa", ".lan",
                  ".intranet", ".corp")
# Ranges `ipaddress` calls global but that reach a private address by another road: NAT64 and
# 6to4 carry an IPv4 address inside, Teredo tunnels, and the rest are not on the public internet.
EXTRA_BLOCKED = tuple(ipaddress.ip_network(n) for n in (
    "64:ff9b::/96", "64:ff9b:1::/48", "2002::/16", "2001::/32", "100.64.0.0/10",
    "192.0.0.0/24", "198.18.0.0/15", "240.0.0.0/4", "0.0.0.0/8",
))
NUMBER_PART = re.compile(r"0x[0-9a-f]*|[0-9]+", re.IGNORECASE)


class Blocked(Exception):
    """The address is refused. `reason` is a short stable word; nothing here is shown raw."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class Target:
    scheme: str
    host: str
    port: int
    path: str  # path and query, starting with a slash


@dataclass(frozen=True)
class Answer:
    status: int
    snippet: str


def address_is_public(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped  # ::ffff:127.0.0.1 is 127.0.0.1
    if (ip.is_loopback or ip.is_link_local or ip.is_private or ip.is_multicast
            or ip.is_reserved or ip.is_unspecified or not ip.is_global):
        return False
    return not any(ip in net for net in EXTRA_BLOCKED if net.version == ip.version)


def parse(url: str, *, allow_local: bool = False) -> Target:
    """The parts of a webhook address, or `Blocked` saying why it will not do."""
    if not url or len(url) > MAX_URL_CHARS or any(c.isspace() or ord(c) < 32 for c in url):
        raise Blocked("malformed")
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError as error:
        raise Blocked("malformed") from error
    if parts.scheme not in ("https", "http"):
        raise Blocked("scheme")
    if parts.scheme == "http" and not allow_local:
        raise Blocked("scheme")
    if parts.username is not None or parts.password is not None or "@" in parts.netloc:
        raise Blocked("credentials")
    if parts.fragment:
        raise Blocked("malformed")
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        raise Blocked("malformed")
    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError as error:
        raise Blocked("malformed") from error
    default = 443 if parts.scheme == "https" else 80
    port = port or default
    if not allow_local and port != 443 and port < 1024:
        raise Blocked("port")
    try:
        ipaddress.ip_address(host)
        is_number = True
    except ValueError:
        # 2130706433, 0x7f.1 and 017700000001 are all 127.0.0.1 to a resolver: a name whose
        # every part is a number is not a name. (No real top-level domain is a number.)
        is_number = all(NUMBER_PART.fullmatch(part) for part in host.split("."))
    if is_number and not allow_local:
        raise Blocked("numeric_host")
    if not allow_local:
        if host == "localhost" or host.endswith(LOCAL_SUFFIXES) or "." not in host:
            raise Blocked("local_name")
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    return Target(parts.scheme, host, port, path)


async def resolve(host: str, port: int) -> list[str]:
    """Every address a name gives. A function of its own so a test can answer for it."""
    infos = await asyncio.get_running_loop().getaddrinfo(
        host, port, type=socket.SOCK_STREAM)
    return list(dict.fromkeys(info[4][0] for info in infos))


async def vet(url: str, *, allow_local: bool = False) -> tuple[Target, str]:
    """The parsed address and the one IP to connect to, after checking every address the name
    gives. Raises `Blocked`; `Blocked("unresolved")` when the name gives none."""
    target = parse(url, allow_local=allow_local)
    try:
        found = await resolve(target.host, target.port)
    except (OSError, UnicodeError) as error:
        raise Blocked("unresolved") from error
    if not found:
        raise Blocked("unresolved")
    for text in found:
        try:
            ip = ipaddress.ip_address(text.split("%")[0])
        except ValueError as error:
            raise Blocked("address") from error
        if not allow_local and not address_is_public(ip):
            raise Blocked("address")
    return target, found[0]


def _snippet(data: bytes) -> str:
    text = data.decode("utf-8", errors="replace")
    clean = "".join(c if c.isprintable() or c in "\n\t" else " " for c in text)
    return " ".join(clean.split())[:SNIPPET_CHARS]


async def post(
    url: str, body: bytes, headers: dict[str, str], *, allow_local: bool = False,
    transport: httpx.AsyncBaseTransport | None = None,
) -> Answer:
    """POST `body` to a shop's address, safely. Returns the receiver's status and the first part
    of its answer. Raises `Blocked` for an address that may not be used and `httpx.HTTPError`
    (or `TimeoutError`) when the receiver cannot be reached. A redirect is returned as it is:
    the caller counts a 3xx as a failure and nothing follows it."""
    target, ip = await vet(url, allow_local=allow_local)
    literal = f"[{ip}]" if ":" in ip else ip
    connect_to = f"{target.scheme}://{literal}:{target.port}{target.path}"
    host_header = target.host if target.port in (80, 443) else f"{target.host}:{target.port}"
    async with asyncio.timeout(TOTAL_SECONDS):
        async with httpx.AsyncClient(
            transport=transport, follow_redirects=False, trust_env=False,
            timeout=httpx.Timeout(CONNECT_SECONDS, read=5.0, write=5.0, pool=CONNECT_SECONDS),
        ) as client:
            async with client.stream(
                "POST", connect_to, content=body,
                headers={**headers, "Host": host_header},
                extensions={"sni_hostname": target.host},
            ) as response:
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) >= MAX_ANSWER_BYTES:
                        break
                return Answer(response.status_code, _snippet(bytes(data[:MAX_ANSWER_BYTES])))
