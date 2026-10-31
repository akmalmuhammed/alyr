"""Load scenarios for the ALYR API (docs/runbooks/capacity.md). Run through stack.sh:

    LT_IMAGE=alyrscale-api:before scripts/loadtest/stack.sh run load.py order-page --rate 10 --duration 60

Every scenario is an *open loop*: requests start at the rate asked for, whether or not earlier
ones have been answered, as customers do. A server that falls behind shows it as latency and
errors, instead of the generator slowing down to match it. Each scenario prints a table
(count, rate, p50/p95/p99/max in milliseconds, errors) and writes the same as JSON.

  order-page   visits to /s/<shop>: the page, more items, one item, the live poll, and for some
               a cart check and an order (what the web app's /api proxy forwards); with --hot-link
               every visit opens the same shop's public link, as when one is posted where many see it
  webhooks     signed Meta webhooks for customer messages, then how long each customer waited
               for the shop's reply to be handed to the channel (read back from the database)
  staff        owners' and staff members' tabs, polling as the workspace does
  documents    receipts issued at a rate (numbered, drawn, stored)
  sunday       every shop's weekly report made due at once, beside a steady stream of customers
  mixed        the 50-shop day at its busiest hour, all of the above together
  pages-seed   issue some documents so the snapshot holds real PDFs

Needs /state/world.json (seed.py), ALYR_LINK_SECRET and ALYR_META_APP_SECRET in the environment.
Fictional data only; talks only to the API containers on the stack's own network.
"""

import argparse
import asyncio
import hashlib
import hmac
import itertools
import json
import os
import random
import statistics
import time
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import asyncpg
import httpx

from alyr.core import links

STATE = os.environ.get("LT_STATE", "/state")
TIMEOUT = 30.0


class Stats:
    """Latencies and statuses by request name."""

    def __init__(self) -> None:
        self.lat: dict[str, list[float]] = defaultdict(list)
        self.codes: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
        self.started = time.perf_counter()

    def add(self, name: str, status: int, ms: float) -> None:
        self.lat[name].append(ms)
        self.codes[name][status] += 1

    def raw(self) -> dict:
        """Every timing and status, so several processes' results can be merged exactly."""
        return {"lat": self.lat, "codes": {k: dict(v) for k, v in self.codes.items()}}

    def table(self, wall: float, expected: tuple[int, ...] = (200, 201, 409, 404)) -> dict:
        out = {}
        for name, values in sorted(self.lat.items()):
            values.sort()
            n = len(values)

            def pct(q: float) -> float:
                return round(values[min(n - 1, int(q * n))], 1)

            codes = self.codes[name]
            bad = sum(c for s, c in codes.items() if s not in expected)
            out[name] = {
                "n": n, "per_s": round(n / wall, 2), "p50": pct(0.50), "p95": pct(0.95),
                "p99": pct(0.99), "max": round(values[-1], 1), "errors": bad,
                "error_pct": round(100 * bad / n, 2),
                "codes": {str(k): v for k, v in sorted(codes.items())},
            }
        return out


class Client:
    """One HTTP client for a set of API containers, taken in turn (as Cloud Run's front door
    spreads requests over its instances)."""

    def __init__(self, bases: list[str], stats: Stats) -> None:
        self.bases = itertools.cycle(bases)
        self.stats = stats
        self.http = httpx.AsyncClient(
            timeout=TIMEOUT, limits=httpx.Limits(max_connections=800, max_keepalive_connections=200),
        )

    async def call(self, name: str, method: str, path: str, **kwargs) -> httpx.Response | None:
        url = next(self.bases) + path
        started = time.perf_counter()
        try:
            response = await self.http.request(method, url, **kwargs)
            status = response.status_code
        except Exception:  # noqa: BLE001 - a timeout or a reset is a result, not a crash
            response, status = None, 0
        self.stats.add(name, status, (time.perf_counter() - started) * 1000)
        return response

    async def close(self) -> None:
        await self.http.aclose()


def load_world() -> dict:
    with open(os.path.join(STATE, "world.json")) as handle:
        return json.load(handle)


async def open_loop(rate: float, duration: float, make) -> int:
    """Start `make()` at random intervals averaging 1/rate for `duration` seconds, then wait
    for what is still running. Answers how many were started."""
    started, due, count = time.perf_counter(), 0.0, 0
    running: set[asyncio.Task] = set()
    while due < duration:
        wait = started + due - time.perf_counter()
        if wait > 0:
            await asyncio.sleep(wait)
        task = asyncio.create_task(make())
        running.add(task)
        task.add_done_callback(running.discard)
        count += 1
        due += random.expovariate(rate)
    if running:
        await asyncio.wait(running, timeout=TIMEOUT + 5)
    return count


def order_token(shop: dict, contact: str) -> str:
    return links.mint(UUID(shop["tenant_id"]), UUID(contact), purpose=links.ORDER)


# --------------------------------------------------------------------------- order page

class OrderPage:
    def __init__(self, client: Client, world: dict, token_share: float, place_share: float,
                 hot: bool = False) -> None:
        self.client, self.shops = client, world["shops"]
        self.order_shops = [s for s in self.shops if "orders" in s["modules"]]
        if hot:  # one link, no customer token, nobody ordering: a post on Instagram
            self.order_shops = self.order_shops[:1]
            token_share = place_share = 0.0
        self.token_share, self.place_share = token_share, place_share
        self.buyable: dict[str, list[dict]] = {}

    async def visit(self) -> None:
        shop = random.choice(self.order_shops)
        slug = shop["slug"]
        headers = {}
        token = None
        if random.random() < self.token_share:
            token = order_token(shop, random.choice(shop["contacts"]))
            headers = {"X-Order-Link": token}
        page = await self.client.call("page", "GET", f"/api/store/{slug}?limit=48", headers=headers)
        if page is None or page.status_code != 200:
            return
        products = page.json().get("products", [])
        if slug not in self.buyable:
            self.buyable[slug] = [p for p in products if not p["needs_choice"]]
        ids = [p["id"] for p in products[:12]]
        if random.random() < 0.25:
            await self.client.call("share", "GET", f"/api/store/{slug}/share")
        if random.random() < 0.6:
            await self.client.call(
                "page-more", "GET", f"/api/store/{slug}?limit=48&offset=48", headers=headers)
        if ids and random.random() < 0.5:
            await self.client.call(
                "item", "GET", f"/api/store/{slug}/items/{random.choice(ids)}", headers=headers)
        if ids and random.random() < 0.4:
            await self.client.call(
                "live", "POST", f"/api/store/{slug}/live", json={"ids": ids, "token": token})
        buyable = self.buyable.get(slug)
        if token and buyable and random.random() < self.place_share:
            lines = [{"product_id": p["id"], "quantity": 1}
                     for p in random.sample(buyable, min(len(buyable), random.randint(1, 3)))]
            checked = await self.client.call(
                "cart-check", "POST", f"/api/store/{slug}/cart/check",
                json={"items": lines, "token": token})
            if checked is not None and checked.status_code == 200 and random.random() < 0.6:
                await self.client.call(
                    "place-order", "POST", f"/api/store/{slug}/orders",
                    json={"token": token, "items": lines, "payment": "link"})


# --------------------------------------------------------------------------- webhooks

TEXTS = ["hello", "hi", "menu", "price list", "هلا", "I want to order", "are you open?"]


def webhook_body(shop: dict, phone: str, wamid: str) -> bytes:
    return json.dumps({
        "object": "whatsapp_business_account",
        "entry": [{"id": "waba", "changes": [{"field": "messages", "value": {
            "messaging_product": "whatsapp",
            "metadata": {"display_phone_number": "97440000000", "phone_number_id": shop["number_id"]},
            "contacts": [{"profile": {"name": "Customer"}, "wa_id": phone}],
            "messages": [{"from": phone, "id": wamid, "timestamp": str(int(time.time())),
                          "type": "text", "text": {"body": random.choice(TEXTS)}}],
        }}]}],
    }).encode()


class Webhooks:
    def __init__(self, client: Client, world: dict) -> None:
        self.client, self.shops = client, world["shops"]
        self.secret = os.environ["ALYR_META_APP_SECRET"].encode()
        self.sent: list[tuple[str, str, float]] = []  # (tenant, phone, time sent)

    async def message(self) -> None:
        shop = random.choice(self.shops)
        phone = random.choice(shop["phones"])
        body = webhook_body(shop, phone, f"wamid.lt{uuid4().hex}")
        signature = "sha256=" + hmac.new(self.secret, body, hashlib.sha256).hexdigest()
        started = time.time()
        response = await self.client.call(
            "webhook", "POST", "/webhooks/whatsapp", content=body,
            headers={"content-type": "application/json", "x-hub-signature-256": signature})
        if response is not None and response.status_code == 200:
            self.sent.append((shop["tenant_id"], phone, started))


async def owner_connection() -> asyncpg.Connection:
    return await asyncpg.connect(os.environ["ALYR_MIGRATION_URL"])


async def wait_for_queue(max_wait: float = 180) -> float:
    """Seconds until every job that is due has been run (or max_wait)."""
    conn = await owner_connection()
    started = time.perf_counter()
    try:
        while time.perf_counter() - started < max_wait:
            left = await conn.fetchval(
                "select count(*) from jobs where status in ('queued', 'running') and run_at <= now()")
            if not left:
                break
            await asyncio.sleep(1)
    finally:
        await conn.close()
    return round(time.perf_counter() - started, 1)


async def reply_lag(sent: list[tuple[str, str, float]]) -> dict:
    """For each message: seconds from the webhook until the first reply to that customer was
    handed to the channel (its send job finished). Read from the database afterwards."""
    if not sent:
        return {}
    since = datetime.fromtimestamp(min(s[2] for s in sent) - 1, UTC)
    conn = await owner_connection()
    try:
        replies = await conn.fetch(
            "select m.id::text id, m.tenant_id::text tenant, c.phone, extract(epoch from m.created_at) at "
            "from messages m join contacts c on c.id = m.contact_id and c.tenant_id = m.tenant_id "
            "where m.direction = 'out' and m.created_at >= $1", since)
        done = {r["mid"]: r["fin"] for r in await conn.fetch(
            "select payload->>'message_id' mid, extract(epoch from finished_at) fin from jobs "
            "where kind = 'send_message' and created_at >= $1 and finished_at is not null", since)}
    finally:
        await conn.close()
    by_customer: dict[tuple[str, str], list[tuple[float, str]]] = defaultdict(list)
    for r in replies:
        by_customer[(r["tenant"], r["phone"])].append((float(r["at"]), r["id"]))
    for rows in by_customer.values():
        rows.sort()
    lags, unanswered = [], 0
    for tenant, phone, started in sent:
        after = next((mid for at, mid in by_customer.get((tenant, phone), []) if at > started), None)
        finished = done.get(after) if after else None
        if finished is None:
            unanswered += 1
        else:
            lags.append(float(finished) - started)
    lags.sort()
    if not lags:
        return {"answered": 0, "unanswered": unanswered, "lags": []}

    def pct(q: float) -> float:
        return round(lags[min(len(lags) - 1, int(q * len(lags)))], 2)

    return {"answered": len(lags), "unanswered": unanswered, "p50_s": pct(0.5),
            "p95_s": pct(0.95), "p99_s": pct(0.99), "max_s": round(lags[-1], 2),
            "lags": [round(x, 3) for x in lags]}


# --------------------------------------------------------------------------- staff tabs

class Tab:
    """One browser tab of a signed-in person, polling as the workspace does (Screens.tsx,
    usePolling): the screen it is on every 5 s, the home screen every 15 s, the shop's details
    every 5 minutes. Tabs on a work screen are most of the load."""

    def __init__(self, client: Client, shop: dict, kind: str) -> None:
        self.client, self.shop, self.kind = client, shop, kind
        self.cookie = {"cookie": f"alyr_session={shop['token']}"}
        self.open_chat: str | None = None

    async def get(self, name: str, path: str):
        return await self.client.call(name, "GET", path, headers=self.cookie)

    async def shop_details(self) -> None:
        await asyncio.gather(self.get("me", "/api/auth/me"), self.get("team", "/api/team"))

    async def look(self) -> None:
        if self.kind == "inbox":
            r = await self.get("inbox-list", "/api/inbox/conversations?status=open&assigned=any")
            if r is not None and r.status_code == 200 and self.open_chat is None:
                rows = r.json().get("conversations", [])
                if rows and random.random() < 0.6:
                    self.open_chat = rows[0]["id"]
            if self.open_chat:
                await self.get("inbox-thread", f"/api/inbox/conversations/{self.open_chat}")
        elif self.kind == "orders":
            await self.get("orders-list", "/api/orders")
        elif self.kind == "bookings":
            today = date.today()
            first, last = today - timedelta(days=90), today + timedelta(days=8)
            await self.get("bookings-list", f"/api/bookings?first={first}&last={last}")
        else:  # the home screen
            await asyncio.gather(
                self.get("home-workspace", "/api/workspace"),
                self.get("home-cards", "/api/workspace/home"),
                self.get("home-agent", "/api/agent?lang=en"),
                self.get("home-readiness", "/api/onboarding/readiness"),
            )

    async def run(self, until: float) -> None:
        period = 15.0 if self.kind == "home" else 5.0
        await asyncio.sleep(random.uniform(0, period))
        await self.shop_details()
        next_details = time.perf_counter() + 300
        while time.perf_counter() < until:
            started = time.perf_counter()
            await self.look()
            if started > next_details:
                await self.shop_details()
                next_details = started + 300
            await asyncio.sleep(max(0.0, period - (time.perf_counter() - started)))


def make_tabs(client: Client, world: dict, per_shop: int) -> list[Tab]:
    tabs = []
    for shop in world["shops"]:
        for _ in range(per_shop):
            roll = random.random()
            booking = "bookings" in shop["modules"]
            kind = ("inbox" if roll < 0.45 else "orders" if roll < 0.70 else
                    "bookings" if roll < 0.80 and booking else "home")
            if kind == "orders" and "orders" not in shop["modules"]:
                kind = "inbox"
            tabs.append(Tab(client, shop, kind))
    return tabs


# --------------------------------------------------------------------------- documents

class Documents:
    def __init__(self, client: Client, world: dict) -> None:
        self.client = client
        self.shops = [s for s in world["shops"] if "documents" in s["modules"]]

    async def issue(self) -> None:
        shop = random.choice(self.shops)
        body = {
            "kind": "receipt", "issue": True, "source": "manual",
            "customer": {"name": "Fatima Al-Kuwari", "phone": "+974 5555 0199"},
            "lines": [
                {"description": "Fresh Arabic bread", "description_ar": "خبز عربي طازج",
                 "quantity": "12", "unit": "piece", "unit_price_minor": 350},
                {"description": "Large date cake", "description_ar": "كعكة التمر",
                 "quantity": "2", "unit": "piece", "unit_price_minor": 4500},
            ],
            "payments": [{"method": "cash", "amount_minor": 13200}],
        }
        await self.client.call(
            "document-issue", "POST", "/api/documents", json=body,
            headers={"cookie": f"alyr_session={shop['token']}", "Idempotency-Key": uuid4().hex})


# --------------------------------------------------------------------------- runner

def report(label: str, stats: Stats, wall: float, extra: dict, expected=(200, 201, 409, 404),
           shard: tuple[int, int] = (0, 1)) -> dict:
    out = os.path.join(STATE, "results")
    os.makedirs(out, exist_ok=True)
    if shard[1] > 1:
        # One of several processes driving the load: write the raw timings; merge.py puts the
        # shards together, so the load generator is never the thing that is measured.
        with open(os.path.join(out, f"{label}.shard{shard[0]}of{shard[1]}.json"), "w") as handle:
            json.dump({"seconds": round(wall, 1), "stats": stats.raw(), "extra": extra}, handle)
        print(f"shard {shard[0] + 1} of {shard[1]} done: {sum(len(v) for v in stats.lat.values())} requests")
        return {}
    table = stats.table(wall, expected)
    result = {"scenario": label, "seconds": round(wall, 1), "requests": table, **extra}
    print(f"\n== {label}  ({wall:.0f} s)")
    print(f"{'request':<18}{'n':>7}{'/s':>8}{'p50':>9}{'p95':>9}{'p99':>9}{'max':>9}{'err%':>7}")
    for name, row in table.items():
        print(f"{name:<18}{row['n']:>7}{row['per_s']:>8}{row['p50']:>9}{row['p95']:>9}"
              f"{row['p99']:>9}{row['max']:>9}{row['error_pct']:>7}")
    for key, value in extra.items():
        if key == "reply_lag":
            value = {k: v for k, v in value.items() if k != "lags"}
        print(f"{key}: {json.dumps(value)}")
    if "reply_lag" in result:
        result["reply_lag"] = {k: v for k, v in result["reply_lag"].items() if k != "lags"}
    with open(os.path.join(out, f"{label}.json"), "w") as handle:
        json.dump(result, handle, indent=1)
    return result


async def staff_run(client: Client, world: dict, per_shop: int, duration: float,
                    shard: tuple[int, int] = (0, 1)) -> int:
    tabs = make_tabs(client, world, per_shop)[shard[0]::shard[1]]
    until = time.perf_counter() + duration
    await asyncio.gather(*(t.run(until) for t in tabs), return_exceptions=True)
    return len(tabs)


async def make_reports_due() -> int:
    conn = await owner_connection()
    try:
        return int((await conn.execute(
            "update jobs set run_at = now() where kind = 'weekly_report' and status = 'queued'"
        )).split()[-1])
    finally:
        await conn.close()


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("scenario", choices=[
        "order-page", "webhooks", "staff", "documents", "sunday", "mixed", "docs-seed"])
    ap.add_argument("--base", default=os.environ.get("LT_BASE") or "http://alyrscale-api1:8080",
                    help="API address(es), comma separated, used in turn")
    ap.add_argument("--rate", type=float, default=5.0, help="visits, messages or documents a second")
    ap.add_argument("--duration", type=float, default=60.0)
    ap.add_argument("--tabs", type=int, default=5, help="staff tabs per shop")
    ap.add_argument("--token-share", type=float, default=0.7)
    ap.add_argument("--place-share", type=float, default=0.3)
    ap.add_argument("--hot-link", action="store_true", help="order-page: every visit to one shop's public link")
    ap.add_argument("--label", default="")
    ap.add_argument("--msg-rate", type=float, default=1.3, help="mixed: messages a second")
    ap.add_argument("--visit-rate", type=float, default=0.5, help="mixed: order page visits a second")
    ap.add_argument("--doc-rate", type=float, default=0.3, help="mixed: documents a second")
    ap.add_argument("--count", type=int, default=0, help="docs-seed: documents in all")
    ap.add_argument("--shard", default="0/1",
                    help="K/N: this process drives its Kth share of N, so the generator is not the "
                         "limit; run.sh starts them and merge.py puts them together")
    args = ap.parse_args()
    world = load_world()
    k, n = (int(x) for x in args.shard.split("/"))
    shard = (k, n)
    args.rate, args.msg_rate, args.visit_rate, args.doc_rate = (
        r / n for r in (args.rate, args.msg_rate, args.visit_rate, args.doc_rate))
    stats = Stats()
    client = Client(args.base.split(","), stats)
    label = args.label or args.scenario
    started = time.perf_counter()
    extra: dict = {}
    try:
        if args.scenario == "order-page":
            page = OrderPage(client, world, args.token_share, args.place_share, args.hot_link)
            extra["visits_started"] = await open_loop(args.rate, args.duration, page.visit)
        elif args.scenario == "webhooks":
            hooks = Webhooks(client, world)
            extra["messages_started"] = await open_loop(args.rate, args.duration, hooks.message)
            extra["queue_drained_after_s"] = await wait_for_queue()
            extra["reply_lag"] = await reply_lag(hooks.sent)
        elif args.scenario == "staff":
            extra["tabs"] = await staff_run(client, world, args.tabs, args.duration, shard)
        elif args.scenario == "documents":
            docs = Documents(client, world)
            extra["documents_started"] = await open_loop(args.rate, args.duration, docs.issue)
        elif args.scenario == "docs-seed":
            docs = Documents(client, world)
            for _ in range(args.count // 10):
                await asyncio.gather(*(docs.issue() for _ in range(10)))
        elif args.scenario == "sunday":
            hooks = Webhooks(client, world)
            extra["reports_due"] = await make_reports_due() if k == 0 else 0
            extra["messages_started"] = await open_loop(args.rate, args.duration, hooks.message)
            extra["queue_drained_after_s"] = await wait_for_queue(600)
            extra["reply_lag"] = await reply_lag(hooks.sent)
        elif args.scenario == "mixed":
            page = OrderPage(client, world, args.token_share, args.place_share)
            hooks, docs = Webhooks(client, world), Documents(client, world)
            staff = asyncio.create_task(staff_run(client, world, args.tabs, args.duration, shard))
            started_all = await asyncio.gather(
                open_loop(args.visit_rate, args.duration, page.visit),
                open_loop(args.msg_rate, args.duration, hooks.message),
                open_loop(args.doc_rate, args.duration, docs.issue),
            )
            extra |= {"visits_started": started_all[0], "messages_started": started_all[1],
                      "documents_started": started_all[2], "tabs": await staff}
            extra["queue_drained_after_s"] = await wait_for_queue()
            extra["reply_lag"] = await reply_lag(hooks.sent)
    finally:
        await client.close()
    report(label, stats, time.perf_counter() - started, extra, shard=shard)


if __name__ == "__main__":
    asyncio.run(main())
