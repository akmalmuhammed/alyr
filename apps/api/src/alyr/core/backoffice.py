"""The internal tool's own records (decision D-033): the audit log of staff actions, the
Today queue, and the staff list.

Every function needs a connection on which the API has declared the caller is ALYR
staff (`app.platform_admin`); row-level security and the `admin_*` functions refuse
otherwise. Nothing here reads what customers wrote: counts and states only.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import asyncpg

from alyr import catalog
from alyr.core import access
from alyr.core.auth import Staff
from alyr.core.workspace import PRODUCT_ADDED

STAFF_SESSION_HOURS = 12


class BackOfficeError(Exception):
    """A request the back office cannot carry out; the message is safe to show."""


async def audit(
    conn: asyncpg.Connection, staff: Staff, action: str, subject_type: str,
    subject_id: object = "", *, client_id: UUID | None = None,
    business_id: UUID | None = None, detail: dict | None = None,
) -> None:
    """Record a staff action. Call it in the same transaction as the change, so the
    change and its record stand or fall together."""
    await conn.execute(
        "insert into platform_audit (staff_email, staff_name, action, subject_type, "
        "subject_id, client_id, business_id, detail) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        staff.email or "local demo", staff.name or "", action, subject_type,
        str(subject_id or ""), client_id, business_id, detail or {},
    )


async def audit_log(
    conn: asyncpg.Connection, client_id: UUID | None = None, limit: int = 200
) -> list[dict]:
    rows = await conn.fetch(
        "select * from platform_audit where $1::uuid is null or client_id = $1 "
        "order by at desc, id desc limit $2",
        client_id, limit,
    )
    return [
        {
            "id": r["id"], "at": r["at"].isoformat(), "staff_email": r["staff_email"],
            "staff_name": r["staff_name"], "action": r["action"],
            "subject_type": r["subject_type"], "subject_id": r["subject_id"],
            "client_id": str(r["client_id"]) if r["client_id"] else None,
            "business_id": str(r["business_id"]) if r["business_id"] else None,
            "detail": r["detail"],
        }
        for r in rows
    ]


# ── staff ─────────────────────────────────────────────────


async def staff_list(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch("select * from admin_staff()")
    return [
        {
            "email": r["email"], "name": r["name"], "added_by": r["added_by"],
            "created_at": r["created_at"].isoformat(),
            "last_sign_in": r["last_sign_in"].isoformat() if r["last_sign_in"] else None,
        }
        for r in rows
    ]


async def add_staff(conn: asyncpg.Connection, email: str, name: str, by: str) -> None:
    email = email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise BackOfficeError("give a work email")
    await conn.execute("select admin_add_staff($1, $2, $3)", email, name.strip(), by)


async def remove_staff(conn: asyncpg.Connection, email: str) -> bool:
    try:
        return await conn.fetchval("select admin_remove_staff($1)", email.strip().lower())
    except asyncpg.InsufficientPrivilegeError as error:
        raise BackOfficeError(str(error).split("\n")[0]) from error


# ── today ─────────────────────────────────────────────────


def _item(
    kind: str, subject: object, title: str, detail: str, since: datetime | None, *,
    client_id: UUID | None = None, business_id: UUID | None = None, urgent: bool = False,
) -> dict:
    return {
        "key": f"{kind}:{subject}", "kind": kind, "title": title, "detail": detail,
        "since": since.isoformat() if since else None,
        "client_id": str(client_id) if client_id else None,
        "business_id": str(business_id) if business_id else None,
        "urgent": urgent,
    }


def _product_name(key: str) -> str:
    product = catalog.PRODUCT_BY_KEY.get(key)
    return product.name.en if product else key


def _days(since: datetime | None, now: datetime) -> float:
    return (now - since).total_seconds() / 86400 if since else 0.0


async def today(conn: asyncpg.Connection) -> dict:
    """Everything that needs ALYR today, oldest and most urgent first, and the items set
    aside until later."""
    now = datetime.now(UTC)
    clients = {r["id"]: r["name"] for r in await conn.fetch("select id, name from clients")}
    businesses = await conn.fetch("select * from admin_businesses()")
    with_business = {b["client_id"] for b in businesses}
    items: list[dict] = []

    for q in await conn.fetch(
        "select id, client_id, number, created_at from quotes where status = 'draft'"
    ):
        if q["client_id"] in with_business:
            items.append(_item(
                "price", q["id"], f"Price {clients.get(q['client_id'], 'a client')}",
                f"Quote {q['number']} is a draft; the owner sees “preparing your price”.",
                q["created_at"], client_id=q["client_id"],
                urgent=_days(q["created_at"], now) >= 1,
            ))
    for q in await conn.fetch(
        "select id, client_id, number, published_at from quotes where status = 'published' "
        "and published_at < now() - interval '2 days'"
    ):
        days = int(_days(q["published_at"], now))
        items.append(_item(
            "answer", q["id"], f"{clients.get(q['client_id'], 'A client')} has not answered",
            f"Quote {q['number']} published {days} days ago. Follow up in person.",
            q["published_at"], client_id=q["client_id"], urgent=days >= 5,
        ))
    # A client accepted a price and has not paid yet. The workspace tells them ALYR sends the
    # bank details, so this is the item that makes that true (ALY-274, CJ-5). It holds the
    # reference the client writes on the transfer, so the payment can be matched when it lands.
    for a in await conn.fetch(
        "select q.client_id, q.number, q.accepted_at from quotes q "
        "join clients c on c.id = q.client_id "
        "where q.status = 'accepted' and c.payment_waived_at is null"
    ):
        if a["client_id"] not in with_business:
            continue
        owes = await access.summary(conn, a["client_id"])
        if owes["status"] != "unpaid":
            continue
        items.append(_item(
            "payment", a["client_id"],
            f"{clients.get(a['client_id'], 'A client')} accepted: waiting for payment",
            f"Quote {a['number']} accepted; {owes['left_text']} still to pay. "
            + ("The pay panel shows them the bank details. " if owes["bank"]
               else "The pay panel has no bank details yet: email them. ")
            + f"The transfer should carry the reference {owes['reference']}.",
            a["accepted_at"], client_id=a["client_id"], urgent=_days(a["accepted_at"], now) >= 1,
        ))
    names = {b["id"]: b for b in businesses}
    for r in await conn.fetch("select * from admin_setup_requests('open')"):
        business = names.get(r["tenant_id"])
        if r["step_key"] == PRODUCT_ADDED:
            # The owner switched a product on in the workspace after the price was set.
            items.append(_item(
                "change", r["id"], f"{r['business']} changed their products",
                f"{_product_name(r['product_key'])} was switched on. {r['note']}".strip(),
                r["created_at"], client_id=business["client_id"] if business else None,
                business_id=r["tenant_id"], urgent=_days(r["created_at"], now) >= 1,
            ))
            continue
        items.append(_item(
            "request", r["id"], f"{r['business']} asked for help",
            f"{_product_name(r['product_key'])} · {r['step_key'] or 'general'}"
            + (f": {r['note']}" if r["note"] else ""),
            r["created_at"], client_id=business["client_id"] if business else None,
            business_id=r["tenant_id"], urgent=_days(r["created_at"], now) >= 2,
        ))
    for b in businesses:
        if b["onboarded_at"] and not b["whatsapp_connected"] and b["slug"] not in ("alyr",):
            items.append(_item(
                "whatsapp", b["id"], f"Connect WhatsApp for {b['name']}",
                "Set up and ready, but no WhatsApp number is connected yet.",
                b["onboarded_at"], client_id=b["client_id"], business_id=b["id"],
            ))
        elif not b["onboarded_at"] and b["created_at"] < now - timedelta(days=3):
            items.append(_item(
                "stuck", b["id"], f"{b['name']} is stuck in onboarding",
                f"Started {int(_days(b['created_at'], now))} days ago, still at "
                f"“{b['onboarding_step'] or 'the start'}”.",
                b["created_at"], client_id=b["client_id"], business_id=b["id"],
            ))
    # Steps ALYR took on for a client (assisted onboarding, ALY-165) and has not finished,
    # as the readiness check last saw them.
    for o in await conn.fetch(
        "select id, name, client_id, live_at, steps from admin_onboarding() "
        "where live_at is null"
    ):
        for step in o["steps"] or []:
            if step["owner"] != "alyr" or step["done_at"]:
                continue
            since = datetime.fromisoformat(step["updated_at"])
            items.append(_item(
                "owe", f"{o['id']}:{step['key']}", f"Do “{step['key']}” for {o['name']}",
                "ALYR took this step on for the client"
                + (f". Held up: {step['blocker']}" if step["blocker"] else "."),
                since, client_id=o["client_id"], business_id=o["id"],
                urgent=_days(since, now) >= 2,
            ))
    reasons: dict = {}
    for r in await conn.fetch("select * from admin_delivery_reasons() order by n desc, error"):
        said = r["error"] or "no reason given"
        reasons.setdefault(r["tenant_id"], []).append(f"{said} ({r['n']})")
    for d in await conn.fetch(
        "select * from admin_delivery_problems() where failed_messages + failed_jobs > 0"
    ):
        business = names.get(d["tenant_id"])
        why = reasons.get(d["tenant_id"], [])
        items.append(_item(
            "delivery", d["tenant_id"], f"Messages failing for {d['name']}",
            f"{d['failed_messages']} failed messages and {d['failed_jobs']} failed jobs "
            "in the last 7 days."
            # What failed, so the first look says whether it is ALYR (could not be delivered:
            # the token, the number, an outage) or the customers' side (WhatsApp's words).
            + (f" Why: {'; '.join(why[:3])}." if why else ""),
            d["last_failure"], client_id=business["client_id"] if business else None,
            business_id=d["tenant_id"], urgent=True,
        ))

    snoozed = {
        r["item_key"]: r["until"]
        for r in await conn.fetch("select item_key, until from today_snoozes where until > now()")
    }
    due = [i for i in items if i["key"] not in snoozed]
    later = [i | {"until": snoozed[i["key"]].isoformat()} for i in items if i["key"] in snoozed]
    due.sort(key=lambda i: (not i["urgent"], i["since"] or ""))
    later.sort(key=lambda i: i["until"])
    counts: dict[str, int] = {}
    for i in due:
        counts[i["kind"]] = counts.get(i["kind"], 0) + 1
    return {"items": due, "later": later, "counts": counts}


async def snooze(conn: asyncpg.Connection, key: str, days: int, by: str) -> datetime:
    if not 1 <= days <= 30:
        raise BackOfficeError("set aside for 1 to 30 days")
    until = await conn.fetchval(
        "insert into today_snoozes (item_key, until, by_email) "
        "values ($1, now() + make_interval(days => $2), $3) on conflict (item_key) do update "
        "set until = excluded.until, by_email = excluded.by_email returning until",
        key, days, by,
    )
    return until


async def unsnooze(conn: asyncpg.Connection, key: str) -> None:
    await conn.execute("delete from today_snoozes where item_key = $1", key)
