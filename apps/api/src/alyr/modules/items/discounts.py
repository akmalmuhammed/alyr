"""Discounts and coupon codes (ALY-150, D-039 "As built (pricing pack)",
`specs/014-pricing-pack/spec.md`).

A shop that has switched on "Discounts and coupon codes" keeps **rules**: coupon codes a customer
types and automatic discounts that need no code. This file stores them, prices a cart against
them (the arithmetic itself is `modules/orders/totals.py`, pure and tested on its own), keeps
the **use counts** honest under concurrent orders, and gives a use back when an order is
cancelled.

* **A quote** is what the order page, the chat and the order itself all ask: the goods, which
  rules apply and what each takes off, line by line, and for each code the customer typed whether
  it applied and, if not, a plain reason in both languages.
* **Using a rule** (`claim`) is a conditional update of the rule's counter inside the order's own
  transaction, the way stock is taken: `uses = uses + 1 where uses < usage_limit`. Two orders for
  the last use meet at the row lock; the loser matches no row and is refused. The table also has
  a check `uses <= usage_limit`, so the database refuses to go over whatever the application
  does. A customer's own limit is counted after the row lock, so two orders of one customer
  cannot both slip under it.
* **Cancelling** an order marks its discount rows returned and gives the uses back, once.
* **What an order was given is a snapshot** (`order_discounts`): the code, the rule in words, the
  amount. Editing or ending a rule never rewrites an order.

Every function takes a tenant-scoped connection.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

import asyncpg

from alyr.core import team
from alyr.core.normalise import fmt_qar, western_digits
from alyr.core.team import Actor
from alyr.modules.items import changes, discount_text
from alyr.modules.items import text as words
from alyr.modules.items.service import BilingualError
from alyr.modules.orders import totals

MAX_RULES = 200
MAX_CODES = 3  # codes one order may carry
MAX_MONEY = 100_000_000
CODE_SHAPE = re.compile(r"^[\w-]{3,24}$")
KINDS = ("coupon", "auto")
VALUE_TYPES = ("percent", "amount", "free_units")


class DiscountError(BilingualError):
    """A rule that cannot be saved, or a use that cannot be made. `code` is stable; the message
    is safe to show, in both languages."""


def _fail(code: str, en: str, ar: str) -> DiscountError:
    return DiscountError(code, en, ar)


# ── codes ───────────────────────────────────────────────────────────────────────────────


def code_forms(raw: str) -> tuple[str, str]:
    """A code as it is shown (capitals, Western digits, no spaces) and as it is matched
    (Arabic spellings folded, dashes and underscores gone), so «ramadan 10», «RAMADAN-10» and
    «Ramadan10» are the same code."""
    shown = re.sub(r"\s+", "", western_digits(raw or "")).upper()
    key = words.fold(shown).replace("-", "").replace("_", "")
    return shown, key


def valid_code(shown: str) -> bool:
    return bool(CODE_SHAPE.match(shown)) and len(shown.replace("-", "").replace("_", "")) >= 3


# ── rows ────────────────────────────────────────────────────────────────────────────────


def to_rule(row: asyncpg.Record) -> totals.Rule:
    return totals.Rule(
        id=row["id"], kind=row["kind"], code=row["code"], value_type=row["value_type"],
        percent=row["percent"], amount=row["amount"], buy_qty=row["buy_qty"],
        get_qty=row["get_qty"], scope=row["scope"], item_ids=frozenset(row["item_ids"]),
        categories=frozenset(c.lower() for c in row["categories"]), min_order=row["min_order"],
        usage_limit=row["usage_limit"], per_customer_limit=row["per_customer_limit"],
        starts_at=row["starts_at"], ends_at=row["ends_at"], stackable=row["stackable"],
        group_id=row["group_id"], status=row["status"], uses=row["uses"],
        name=row["name"], name_ar=row["name_ar"],
    )


def rule_words(row: asyncpg.Record, lang: str) -> str:
    """A stored rule in words (the list, the activity record)."""
    return discount_text.rule_text(
        row["value_type"], lang, percent=row["percent"], amount=row["amount"],
        buy_qty=row["buy_qty"], get_qty=row["get_qty"], scope=row["scope"],
        min_order=row["min_order"],
    )


def rule_text_both(rule: totals.Rule) -> tuple[str, str]:
    def one(lang: str) -> str:
        return discount_text.rule_text(
            rule.value_type, lang, percent=rule.percent, amount=rule.amount,
            buy_qty=rule.buy_qty, get_qty=rule.get_qty, scope=rule.scope,
            min_order=rule.min_order,
        )

    return one("en"), one("ar")


# ── a quote ─────────────────────────────────────────────────────────────────────────────


@dataclass
class CouponResult:
    code: str  # as shown
    ok: bool
    amount: int = 0
    problem: totals.Problem | None = None


@dataclass
class Quote:
    """The goods priced against the shop's rules."""

    subtotal: int
    applied: list[totals.Applied] = field(default_factory=list)
    line_discounts: dict[int, int] = field(default_factory=dict)
    coupons: list[CouponResult] = field(default_factory=list)

    @property
    def discount_total(self) -> int:
        return sum(a.amount for a in self.applied)

    @property
    def goods(self) -> int:
        return self.subtotal - self.discount_total


def plain_quote(lines: list[totals.Line]) -> Quote:
    """No rules: the goods as they are."""
    return Quote(
        sum(line.gross for line in lines), [], dict.fromkeys((line.index for line in lines), 0), []
    )


async def customer_uses(
    conn: asyncpg.Connection, contact_id: UUID | None, rule_ids: list[UUID]
) -> dict[UUID, int]:
    if contact_id is None or not rule_ids:
        return {}
    rows = await conn.fetch(
        "select d.rule_id, count(*)::int as n from order_discounts d "
        "join orders o on o.id = d.order_id "
        "where o.contact_id = $1 and d.rule_id = any($2) and d.returned_at is null "
        "group by d.rule_id",
        contact_id, rule_ids,
    )
    return {r["rule_id"]: r["n"] for r in rows}


def typed(codes: list[str] | None) -> list[tuple[str, str]]:
    """The codes a customer typed as (shown, key), duplicates dropped, in order."""
    seen: dict[str, str] = {}
    for raw in codes or []:
        shown, key = code_forms(raw)
        if key and key not in seen:
            seen[key] = shown
    return [(shown, key) for key, shown in seen.items()]


async def quote(
    conn: asyncpg.Connection, lines: list[totals.Line], codes: list[str] | None, *,
    contact_id: UUID | None, group_id: UUID | None, now: datetime,
) -> Quote:
    """Price a cart. Every automatic rule and every code the customer typed is a candidate;
    `totals.compute` decides what applies. Never changes anything."""
    entered = typed(codes)
    result = Quote(
        sum(line.gross for line in lines), [], dict.fromkeys((line.index for line in lines), 0), []
    )
    found: dict[str, totals.Rule] = {}
    if entered:
        rows = await conn.fetch(
            "select * from discount_rules where kind = 'coupon' and code_key = any($1)",
            [key for _, key in entered],
        )
        found = {r["code_key"]: to_rule(r) for r in rows}
    autos = [to_rule(r) for r in await conn.fetch(
        "select * from discount_rules where kind = 'auto' and status = 'active' "
        "order by created_at, id"
    )]
    candidates = autos + [found[key] for _, key in entered if key in found]
    ctx = totals.Context(
        now, group_id,
        await customer_uses(conn, contact_id, [r.id for r in candidates]),
    )
    computed = totals.compute(lines, candidates, ctx)
    result.applied = computed.applied
    result.line_discounts = computed.line_discounts
    reasons = {rule.id: problem for rule, problem in computed.rejected}
    applied_ids = {a.rule.id: a for a in computed.applied}
    for shown, key in entered:
        rule = found.get(key)
        if rule is None:
            result.coupons.append(CouponResult(
                shown, False, 0, totals.Problem("coupon_unknown", {"code": shown})
            ))
        elif rule.id in applied_ids:
            result.coupons.append(CouponResult(shown, True, applied_ids[rule.id].amount))
        else:
            result.coupons.append(CouponResult(
                shown, False, 0, reasons.get(rule.id) or totals.Problem("coupon_no_effect")
            ))
    return result


def problem_words(problem: totals.Problem, code: str, tz: str) -> tuple[str, str]:
    """A refusal in English and in Arabic."""
    details = {**problem.details, "code": code}
    return (
        discount_text.say(problem.code, "en", details, tz),
        discount_text.say(problem.code, "ar", details, tz),
    )


def view(quote_: Quote, tz: str) -> dict:
    """The quote as the order page and the workspace read it: what came off, why, and how each
    typed code fared."""
    out_applied = []
    for a in quote_.applied:
        en, ar = rule_text_both(a.rule)
        out_applied.append({
            "id": str(a.rule.id), "kind": a.rule.kind, "code": a.rule.code,
            "name": a.rule.name, "name_ar": a.rule.name_ar, "text": en, "text_ar": ar,
            "amount": a.amount, "amount_text": fmt_qar(a.amount),
            "lines": sorted(a.per_line),
        })
    coupons = []
    for c in quote_.coupons:
        item = {"code": c.code, "ok": c.ok, "amount": c.amount}
        if c.problem is not None:
            en, ar = problem_words(c.problem, c.code, tz)
            item |= {"reason": c.problem.code, "message": en, "message_ar": ar}
        coupons.append(item)
    return {
        "subtotal": quote_.subtotal, "subtotal_text": fmt_qar(quote_.subtotal),
        "discounts": out_applied, "discount_total": quote_.discount_total,
        "discount_total_text": fmt_qar(quote_.discount_total),
        "goods": quote_.goods, "goods_text": fmt_qar(quote_.goods),
        "coupons": coupons,
    }


# ── using a rule: the race-safe step ────────────────────────────────────────────────────


async def _why_not(conn: asyncpg.Connection, rule: totals.Rule, now: datetime) -> DiscountError:
    """The reason a conditional use matched no row, from the rule as it is now."""
    row = await conn.fetchrow("select * from discount_rules where id = $1", rule.id)
    problem = None
    if row is not None:
        current = to_rule(row)
        if current.status == "paused":
            problem = totals.Problem("coupon_paused")
        elif current.status == "ended" or (current.ends_at and now >= current.ends_at):
            problem = totals.Problem("coupon_ended", {"on": current.ends_at})
        elif current.usage_limit is not None and current.uses >= current.usage_limit:
            problem = totals.Problem("coupon_used_up")
    problem = problem or totals.Problem("coupon_no_effect")
    en, ar = problem_words(problem, rule.code, "Asia/Qatar")
    error = _fail(problem.code, en, ar)
    error.coupon = rule.code  # type: ignore[attr-defined]
    return error


async def claim(
    conn: asyncpg.Connection, order_id: UUID, contact_id: UUID, applied: list[totals.Applied],
    now: datetime,
) -> None:
    """Use each applied rule for this order and keep what the order was given. Call inside the
    transaction that inserts the order. Raises `DiscountError` (rolling the order back) when a
    rule can no longer be used, so a limited coupon is never over-used."""
    position = {a.rule.id: i for i, a in enumerate(applied)}
    # Rules are locked in a fixed order, so two orders that use the same two rules cannot wait on
    # each other; what is kept on the order is in the order they were applied.
    for a in sorted(applied, key=lambda x: x.rule.id):
        rule, sort = a.rule, position[a.rule.id]
        row = await conn.fetchrow(
            "update discount_rules set uses = uses + 1, updated_at = now() "
            "where id = $1 and status = 'active' "
            "and (usage_limit is null or uses < usage_limit) "
            "and (ends_at is null or ends_at > $2) returning per_customer_limit",
            rule.id, now,
        )
        if row is None:
            raise await _why_not(conn, rule, now)
        limit = row["per_customer_limit"]
        if limit is not None:
            # The rule's row is locked until this transaction ends, so another order of this
            # customer's for the same rule is already counted, or waits behind this one.
            used = await conn.fetchval(
                "select count(*) from order_discounts d join orders o on o.id = d.order_id "
                "where o.contact_id = $1 and d.rule_id = $2 and d.returned_at is null",
                contact_id, rule.id,
            )
            if used >= limit:
                problem = totals.Problem("coupon_used_by_you", {"limit": limit})
                en, ar = problem_words(problem, rule.code, "Asia/Qatar")
                raise _fail(problem.code, en, ar)
        en, ar = rule_text_both(rule)
        await conn.execute(
            "insert into order_discounts (order_id, rule_id, kind, code, name, name_ar, "
            "rule_text, rule_text_ar, value_type, percent, amount, buy_qty, get_qty, scope, "
            "stackable, amount_off, sort) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)",
            order_id, rule.id, rule.kind, rule.code, rule.name, rule.name_ar, en, ar,
            rule.value_type, rule.percent, rule.amount, rule.buy_qty, rule.get_qty, rule.scope,
            rule.stackable, a.amount, sort,
        )


async def give_back(conn: asyncpg.Connection, order_id: UUID) -> int:
    """An order was cancelled: its uses go back to the rules, once. Returns how many."""
    rows = await conn.fetch(
        "update order_discounts set returned_at = now() "
        "where order_id = $1 and returned_at is null returning rule_id", order_id,
    )
    for r in rows:
        if r["rule_id"] is not None:
            await conn.execute(
                "update discount_rules set uses = greatest(uses - 1, 0), updated_at = now() "
                "where id = $1", r["rule_id"],
            )
    return len(rows)


async def for_order(conn: asyncpg.Connection, order_id: UUID) -> list[dict]:
    """What an order was given, as it was then."""
    rows = await conn.fetch(
        "select * from order_discounts where order_id = $1 order by sort", order_id
    )
    return [snapshot(r) for r in rows]


def snapshot(r: asyncpg.Record) -> dict:
    return {
        "kind": r["kind"], "code": r["code"], "name": r["name"], "name_ar": r["name_ar"],
        "text": r["rule_text"], "text_ar": r["rule_text_ar"], "amount": r["amount_off"],
        "amount_text": fmt_qar(r["amount_off"]), "returned": r["returned_at"] is not None,
    }


# ── the owner's rules ───────────────────────────────────────────────────────────────────


def _state(row: asyncpg.Record, now: datetime) -> str:
    """Where a rule stands: scheduled, active, paused, used_up or ended."""
    if row["status"] == "ended" or (row["ends_at"] and now >= row["ends_at"]):
        return "ended"
    if row["status"] == "paused":
        return "paused"
    if row["usage_limit"] is not None and row["uses"] >= row["usage_limit"]:
        return "used_up"
    if row["starts_at"] and now < row["starts_at"]:
        return "scheduled"
    return "active"


async def _stats(conn: asyncpg.Connection) -> dict[UUID, tuple[int, int]]:
    rows = await conn.fetch(
        "select rule_id, count(*)::int as n, coalesce(sum(amount_off), 0)::bigint as given "
        "from order_discounts where returned_at is null and rule_id is not null "
        "group by rule_id"
    )
    return {r["rule_id"]: (r["n"], r["given"]) for r in rows}


async def list_rules(conn: asyncpg.Connection, now: datetime) -> dict:
    rows = await conn.fetch(
        "select r.*, g.name as group_name, g.name_ar as group_name_ar from discount_rules r "
        "left join price_groups g on g.id = r.group_id order by r.created_at desc, r.id"
    )
    stats = await _stats(conn)
    ids = {i for r in rows for i in r["item_ids"]}
    names = {}
    if ids:
        names = {
            r["id"]: r for r in await conn.fetch(
                "select id, name, name_ar from items where id = any($1)", list(ids)
            )
        }
    out = []
    for r in rows:
        uses, given = stats.get(r["id"], (0, 0))
        out.append(view_rule(r, now, uses, given, names))
    total = sum(x["given"] for x in out)
    return {"rules": out, "given_total": total, "given_total_text": fmt_qar(total),
            "limits": {"rules": MAX_RULES}}


def view_rule(
    r: asyncpg.Record, now: datetime, uses: int, given: int, names: dict | None = None
) -> dict:
    names = names or {}
    en = rule_words(r, "en")
    ar = rule_words(r, "ar")
    return {
        "id": str(r["id"]), "kind": r["kind"], "code": r["code"], "name": r["name"],
        "name_ar": r["name_ar"], "text": en, "text_ar": ar, "value_type": r["value_type"],
        # (the connection hands a whole number back as an int, a fraction as a Decimal)
        "percent": str(Decimal(r["percent"]).normalize()) if r["percent"] is not None else None,
        "amount": r["amount"], "buy_qty": r["buy_qty"], "get_qty": r["get_qty"],
        "scope": r["scope"],
        "items": [
            {"id": str(i), "name": names[i]["name"], "name_ar": names[i]["name_ar"]}
            for i in r["item_ids"] if i in names
        ],
        "categories": list(r["categories"]), "min_order": r["min_order"],
        "usage_limit": r["usage_limit"], "per_customer_limit": r["per_customer_limit"],
        "starts_at": r["starts_at"].isoformat() if r["starts_at"] else None,
        "ends_at": r["ends_at"].isoformat() if r["ends_at"] else None,
        "stackable": r["stackable"], "group_id": str(r["group_id"]) if r["group_id"] else None,
        "group": {"name": r["group_name"], "name_ar": r["group_name_ar"]}
        if "group_name" in r.keys() and r["group_name"] else None,
        "status": r["status"], "state": _state(r, now),
        "uses": uses, "given": given, "given_text": fmt_qar(given),
        "created_by": r["created_by"], "created_at": r["created_at"].isoformat(),
    }


async def get_rule(conn: asyncpg.Connection, rule_id: UUID, now: datetime) -> dict | None:
    row = await conn.fetchrow(
        "select r.*, g.name as group_name, g.name_ar as group_name_ar from discount_rules r "
        "left join price_groups g on g.id = r.group_id where r.id = $1", rule_id,
    )
    if row is None:
        return None
    uses, given = (await _stats(conn)).get(row["id"], (0, 0))
    ids = list(row["item_ids"])
    names = {
        r["id"]: r for r in await conn.fetch(
            "select id, name, name_ar from items where id = any($1)", ids
        )
    } if ids else {}
    return view_rule(row, now, uses, given, names)


def _int(value, name: str, low: int, high: int, en: str, ar: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise _fail(f"bad_{name}", en, ar)
    return value


def _aware(moment: datetime | None, tz: str) -> datetime | None:
    """A date typed without a zone is the shop's wall clock."""
    if moment is not None and moment.tzinfo is None:
        return moment.replace(tzinfo=ZoneInfo(tz))
    return moment


async def _checked(
    conn: asyncpg.Connection, data: dict, current: asyncpg.Record | None, tz: str
) -> dict:
    """The rule's fields, checked, in the order the table has them. `current` is the rule being
    changed (None for a new one)."""
    kind = data.get("kind", current["kind"] if current else None)
    if kind not in KINDS:
        raise _fail("bad_kind", "Choose a coupon code or an automatic discount.",
                    "اختر رمز قسيمة أو خصماً تلقائياً.")
    out: dict = {"kind": kind}
    if kind == "coupon":
        raw = data.get("code", current["code"] if current else "")
        shown, key = code_forms(raw)
        if not valid_code(shown):
            raise _fail(
                "bad_code", "A code is 3 to 24 letters or numbers, with no spaces.",
                "الرمز من 3 إلى 24 حرفاً أو رقماً دون مسافات.",
            )
        out["code"], out["code_key"] = shown, key
    else:
        out["code"], out["code_key"] = "", ""
    out["name"] = " ".join(str(data.get("name", current["name"] if current else "")).split())[:60]
    out["name_ar"] = " ".join(
        str(data.get("name_ar", current["name_ar"] if current else "")).split()
    )[:60]
    value_type = data.get("value_type", current["value_type"] if current else None)
    if value_type not in VALUE_TYPES:
        raise _fail("bad_value_type", "Choose a percentage, an amount off, or free units.",
                    "اختر نسبة أو مبلغاً أو وحدات مجانية.")
    out["value_type"] = value_type
    out["percent"] = out["amount"] = out["buy_qty"] = out["get_qty"] = None
    if value_type == "percent":
        raw = data.get("percent", current["percent"] if current else None)
        try:
            percent = Decimal(str(raw))
        except Exception:
            percent = Decimal(0)
        if not Decimal("0") < percent <= Decimal("100") or percent != percent.quantize(
            Decimal("0.001")
        ):
            raise _fail("bad_percent", "A percentage is more than 0 and at most 100.",
                        "النسبة أكبر من 0 وتصل إلى 100 على الأكثر.")
        out["percent"] = percent
    elif value_type == "amount":
        raw = data.get("amount", current["amount"] if current else None)
        out["amount"] = _int(raw, "amount", 1, MAX_MONEY, "Say how much comes off, in riyals.",
                             "اكتب المبلغ المخصوم بالريال.")
    else:
        out["buy_qty"] = _int(
            data.get("buy_qty", current["buy_qty"] if current else None), "buy", 1, 99,
            "Say how many to buy (1 to 99).", "اكتب عدد القطع المطلوب شراؤها (من 1 إلى 99).",
        )
        out["get_qty"] = _int(
            data.get("get_qty", (current["get_qty"] if current else None) or 1), "get", 1, 99,
            "Say how many come free (1 to 99).", "اكتب عدد القطع المجانية (من 1 إلى 99).",
        )
    scope = data.get("scope", current["scope"] if current else "order")
    if scope not in ("order", "selected"):
        raise _fail("bad_scope", "Choose the whole order or chosen items.",
                    "اختر الطلب كله أو أصنافاً محددة.")
    out["scope"] = scope
    item_ids = [
        UUID(str(i))
        for i in data.get("item_ids", list(current["item_ids"]) if current else [])
    ]
    categories = [
        " ".join(str(c).split()) for c in data.get(
            "categories", list(current["categories"]) if current else []
        ) if str(c).strip()
    ]
    if scope == "selected":
        if not item_ids and not categories:
            raise _fail("scope_empty", "Choose at least one item or category.",
                        "اختر صنفاً أو فئة واحدة على الأقل.")
        if item_ids:
            have = {r["id"] for r in await conn.fetch(
                "select id from items where id = any($1) and status <> 'archived'", item_ids
            )}
            if set(item_ids) - have:
                raise _fail("unknown_item", "One of the chosen items is not in your Catalog.",
                            "أحد الأصناف المختارة غير موجود في الكتالوج.")
    else:
        item_ids, categories = [], []
    out["item_ids"], out["categories"] = item_ids, categories
    out["min_order"] = _int(
        data.get("min_order", current["min_order"] if current else 0), "min_order", 0, MAX_MONEY,
        "The minimum order must be zero or more.", "الحد الأدنى للطلب صفر أو أكثر.",
    )
    for field_, label in (
        ("usage_limit", "total limit"), ("per_customer_limit", "limit for each customer"),
    ):
        value = data.get(field_, current[field_] if current else None)
        out[field_] = None if value is None else _int(
            value, field_, 1, 1_000_000, f"The {label} is 1 or more, or empty for none.",
            "الحد 1 أو أكثر، أو اتركه فارغاً لعدم وجود حد.",
        )
    starts = _aware(data.get("starts_at", current["starts_at"] if current else None), tz)
    ends = _aware(data.get("ends_at", current["ends_at"] if current else None), tz)
    if starts is not None and ends is not None and ends <= starts:
        raise _fail("bad_dates", "The end must be after the start.",
                    "يجب أن يكون الانتهاء بعد البدء.")
    out["starts_at"], out["ends_at"] = starts, ends
    out["stackable"] = bool(data.get("stackable", current["stackable"] if current else False))
    group_id = data.get("group_id", current["group_id"] if current else None)
    if group_id is not None:
        group_id = UUID(str(group_id))
        if not await conn.fetchval(
            "select true from price_groups where id = $1 and archived_at is null", group_id
        ):
            raise _fail("unknown_group", "That price group does not exist.",
                        "مجموعة الأسعار هذه غير موجودة.")
    out["group_id"] = group_id
    return out


_COLUMNS = (
    "kind", "code", "code_key", "name", "name_ar", "value_type", "percent", "amount", "buy_qty",
    "get_qty", "scope", "item_ids", "categories", "min_order", "usage_limit",
    "per_customer_limit", "starts_at", "ends_at", "stackable", "group_id",
)


def _plain(value):
    """A value as the activity record keeps it (JSON): numbers and text as they are, the rest as
    text."""
    if value is None or isinstance(value, (int, str, list, bool)):
        return value
    return str(value)


def _changed(before: asyncpg.Record | None, after: dict) -> list[dict]:
    out = []
    for col in _COLUMNS:
        if col == "code_key":
            continue
        was = before[col] if before is not None else None
        now = after[col]
        if isinstance(was, list):
            was = sorted(str(x) for x in was)
        if isinstance(now, list):
            now = sorted(str(x) for x in now)
        if was != now:
            out.append({
                "field": col,
                "from": _plain(was),
                "to": _plain(now),
            })
    return out


async def save_rule(
    conn: asyncpg.Connection, actor: Actor, data: dict, now: datetime,
    rule_id: UUID | None = None,
) -> dict:
    """Make a rule or change one. A rule that has been used keeps its code (customers know it);
    its limit cannot go below the uses it already has."""
    current = None
    if rule_id is not None:
        current = await conn.fetchrow(
            "select * from discount_rules where id = $1 for update", rule_id
        )
        if current is None:
            raise _fail("not_found", "That discount does not exist.", "هذا الخصم غير موجود.")
        if current["status"] == "ended":
            raise _fail("ended", "An ended discount cannot be changed. Make a copy instead.",
                        "لا يمكن تعديل خصم منتهٍ. أنشئ نسخة منه.")
    elif await conn.fetchval(
        "select count(*) from discount_rules where status <> 'ended'"
    ) >= MAX_RULES:
        raise _fail("too_many", f"You can have up to {MAX_RULES} discounts at a time.",
                    f"يمكنك امتلاك {MAX_RULES} خصماً على الأكثر في وقت واحد.")
    zone = await conn.fetchval(
        "select timezone from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    fields = await _checked(conn, data, current, zone or "Asia/Qatar")
    if current is not None:
        if fields["code_key"] != current["code_key"] and current["uses"]:
            raise _fail("code_locked", "This code has been used, so it cannot be renamed.",
                        "استُخدم هذا الرمز، فلا يمكن تغيير اسمه.")
        if fields["usage_limit"] is not None and fields["usage_limit"] < current["uses"]:
            raise _fail(
                "limit_below_uses",
                f"It has already been used {current['uses']} times, so the limit cannot be lower.",
                f"استُخدم {current['uses']} مرة، فلا يمكن أن يكون الحد أقل من ذلك.",
            )
    try:
        if current is None:
            row = await conn.fetchrow(
                f"insert into discount_rules ({', '.join(_COLUMNS)}, created_by) values "
                f"({', '.join(f'${i + 1}' for i in range(len(_COLUMNS) + 1))}) returning *",
                *(fields[c] for c in _COLUMNS), actor.name,
            )
            action = "discount_added"
        else:
            sets = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(_COLUMNS))
            row = await conn.fetchrow(
                f"update discount_rules set {sets}, updated_at = now() where id = $1 returning *",
                rule_id, *(fields[c] for c in _COLUMNS),
            )
            action = "discount_changed"
    except asyncpg.UniqueViolationError as error:
        raise _fail("code_taken", "You already have a discount with this code.",
                    "لديك خصم بهذا الرمز بالفعل.") from error
    delta = _changed(current, fields)
    if current is None or delta:
        await team.record(
            conn, changes.SUBJECT, row["id"], action, actor, None,
            {"code": row["code"], "text": rule_words(row, "en"), "changes": delta or None},
        )
    return await get_rule(conn, row["id"], now)


async def set_status(
    conn: asyncpg.Connection, actor: Actor, rule_id: UUID, action: str, now: datetime
) -> dict | None:
    """Pause, resume or end a rule. Ending is for good (ends it now); a copy starts again."""
    row = await conn.fetchrow("select * from discount_rules where id = $1 for update", rule_id)
    if row is None:
        return None
    if row["status"] == "ended" and action != "end":
        raise _fail("ended", "An ended discount cannot be started again. Make a copy instead.",
                    "لا يمكن إعادة تشغيل خصم منتهٍ. أنشئ نسخة منه.")
    if action == "pause" and row["status"] == "active":
        await conn.execute(
            "update discount_rules set status = 'paused', updated_at = now() where id = $1",
            rule_id,
        )
    elif action == "resume" and row["status"] == "paused":
        if row["ends_at"] is not None and now >= row["ends_at"]:
            raise _fail(
                "ended", "It has passed its end date, so it cannot be started again. "
                "Make a copy instead.",
                "تجاوز تاريخ الانتهاء، فلا يمكن تشغيله. أنشئ نسخة منه.",
            )
        await conn.execute(
            "update discount_rules set status = 'active', updated_at = now() where id = $1",
            rule_id,
        )
    elif action == "end" and row["status"] != "ended":
        await conn.execute(
            "update discount_rules set status = 'ended', updated_at = now(), "
            "starts_at = case when starts_at > $2 then null else starts_at end, "
            "ends_at = case when ends_at is null or ends_at > $2 then $2 else ends_at end "
            "where id = $1", rule_id, now,
        )
    elif action not in ("pause", "resume", "end"):
        raise _fail(
            "bad_action", "Choose pause, resume or end.", "اختر إيقاف مؤقت أو استئناف أو إنهاء."
        )
    else:
        return await get_rule(conn, rule_id, now)  # already there: nothing to do
    await team.record(
        conn, changes.SUBJECT, rule_id, {"pause": "discount_paused", "resume": "discount_resumed",
                                         "end": "discount_ended"}[action],
        actor, None, {"code": row["code"], "text": rule_words(row, "en")},
    )
    return await get_rule(conn, rule_id, now)


# ── what the order page may say about automatic discounts ────────────────────────────────


async def offers(conn: asyncpg.Connection, group_id: UUID | None, now: datetime) -> list[dict]:
    """The automatic discounts a customer could be given right now, in words, for a line on the
    order page ("10% off orders over QAR 200"). Not the codes: those are the shop's to hand out."""
    out = []
    ctx = totals.Context(now, group_id)
    for r in await conn.fetch(
        "select * from discount_rules where kind = 'auto' and status = 'active' "
        "order by created_at, id"
    ):
        rule = to_rule(r)
        if totals.availability(rule, ctx) is None:
            en, ar = rule_text_both(rule)
            out.append({"text": en, "text_ar": ar})
    return out
