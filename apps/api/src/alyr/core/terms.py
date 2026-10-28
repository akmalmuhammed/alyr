"""Terms and the privacy notice: what an owner accepts, and the record that they did
(ALY-167, D-067, spec 031).

ALYR publishes versions of two documents, the customer agreement and the privacy notice
(`terms_versions`, written only by the back office, never changed once published). The newest
version of each kind is the current one. An owner accepts every current version when they create
their business and again whenever a new one is published. Each acceptance is a row in the
business's own append-only record: who, which version, when, and from which address.

Functions that read what is current take any connection (the list is public, the sign-up screen
shows it before the business exists). The rest take a connection scoped to the business.
"""

from uuid import UUID

import asyncpg

KINDS = ("agreement", "privacy")

_CURRENT = (
    "select distinct on (kind) id, kind, version, title, title_ar, url, url_ar, changes, "
    "changes_ar, published_at from terms_versions order by kind, published_at desc, version desc"
)


class TermsError(Exception):
    """A change the record cannot make; the message is safe to show."""


def _shown(row: asyncpg.Record, accepted_at=None) -> dict:
    return {
        "id": str(row["id"]), "kind": row["kind"], "version": row["version"],
        "title": row["title"], "title_ar": row["title_ar"],
        "url": row["url"], "url_ar": row["url_ar"],
        "changes": row["changes"], "changes_ar": row["changes_ar"],
        "published_at": row["published_at"].isoformat(),
        "accepted_at": accepted_at.isoformat() if accepted_at else None,
    }


async def current(conn: asyncpg.Connection) -> list[dict]:
    """The version of each kind an owner is asked to accept now."""
    return [_shown(r) for r in await conn.fetch(_CURRENT)]


async def _with_acceptance(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    """The current versions, each with when the business in scope accepted it (or null)."""
    return await conn.fetch(
        "select c.*, a.accepted_at from (" + _CURRENT + ") c "
        "left join terms_acceptances a on a.version_id = c.id order by c.kind"
    )


async def pending(conn: asyncpg.Connection) -> list[dict]:
    """The current versions the business in scope has not accepted yet."""
    return [_shown(r) for r in await _with_acceptance(conn) if r["accepted_at"] is None]


async def state(conn: asyncpg.Connection) -> dict:
    """What the business has been asked, and what is still open."""
    shown = [_shown(r, r["accepted_at"]) for r in await _with_acceptance(conn)]
    return {"current": shown, "pending": [t for t in shown if t["accepted_at"] is None]}


async def history(conn: asyncpg.Connection) -> list[dict]:
    """Every acceptance the business in scope made, newest first, for the back office."""
    rows = await conn.fetch(
        "select v.kind, v.version, v.title, a.accepted_by, a.accepted_at, a.ip, a.user_agent "
        "from terms_acceptances a join terms_versions v on v.id = a.version_id "
        "order by a.accepted_at desc, a.id desc"
    )
    return [
        {"kind": r["kind"], "version": r["version"], "title": r["title"],
         "accepted_by": r["accepted_by"], "accepted_at": r["accepted_at"].isoformat(),
         "ip": r["ip"], "user_agent": r["user_agent"]}
        for r in rows
    ]


async def accept(
    conn: asyncpg.Connection, version_ids: list[UUID], user_id: UUID | None, name: str,
    ip: str, user_agent: str,
) -> int:
    """Record that the person accepted these versions. Only a current version can be accepted
    (an owner who read an older one is asked to read the newer), and accepting twice records
    once. Answers how many were recorded now."""
    wanted = {str(v) for v in version_ids}
    now_current = {t["id"] for t in await current(conn)}
    if wanted - now_current:
        raise TermsError("these terms have changed; read the new version and accept it")
    added = 0
    for version_id in sorted(wanted):
        added += (await conn.execute(
            "insert into terms_acceptances (version_id, user_id, accepted_by, ip, user_agent) "
            "values ($1, $2, $3, $4, $5) on conflict (tenant_id, version_id) do nothing",
            UUID(version_id), user_id, name[:120], ip[:64], user_agent[:300],
        )).endswith("1")
    return added


async def publish(
    conn: asyncpg.Connection, *, kind: str, version: str, title: str, title_ar: str, url: str,
    url_ar: str, changes: str, changes_ar: str, by: str,
) -> dict:
    """Add a version, back office only. It becomes the current one of its kind and every owner
    is asked once. A published version is never changed: a correction is a new version."""
    if kind not in KINDS:
        raise TermsError("choose the customer agreement or the privacy notice")
    version = version.strip()
    if not version or not title.strip() or not title_ar.strip():
        raise TermsError("give the version and its title in English and Arabic")
    for address in (url, url_ar):
        local = address.startswith("/") and not address.startswith("//")
        if not (local or address.startswith("https://")):
            raise TermsError("the text is read at a path on alyr.qa or an https address")
    try:
        row = await conn.fetchrow(
            "insert into terms_versions (kind, version, title, title_ar, url, url_ar, changes, "
            "changes_ar, published_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *",
            kind, version, title.strip(), title_ar.strip(), url, url_ar, changes.strip(),
            changes_ar.strip(), by,
        )
    except asyncpg.UniqueViolationError as error:
        raise TermsError("that version already exists; a correction is a new version") from error
    return _shown(row)


async def versions(conn: asyncpg.Connection) -> list[dict]:
    """Every version ever published, newest first, and which ones are current."""
    now_current = {t["id"] for t in await current(conn)}
    rows = await conn.fetch(
        "select id, kind, version, title, title_ar, url, url_ar, changes, changes_ar, "
        "published_at, published_by from terms_versions order by published_at desc, version desc"
    )
    return [
        {**_shown(r), "published_by": r["published_by"], "is_current": str(r["id"]) in now_current}
        for r in rows
    ]
