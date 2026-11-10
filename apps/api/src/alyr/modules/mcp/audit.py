"""What is written on the activity record (spec 067, "What is logged").

Every call is one row: subject `mcp`, the permission's ID as the subject's ID, channel `mcp`, the
person, the app, the tool, the arguments (never the answer) and the result. The arguments are cut,
and a confirm token is taken out of them: the record is read by people, and a token in it would be
a token anyone who reads the record could use.
"""

import json
from uuid import UUID

import asyncpg

from alyr.core import team
from alyr.core.team import Actor

SUBJECT = "mcp"
MAX_ARGS_CHARS = 1000
REDACTED = ("confirm_token",)


def clean_args(args: dict | None) -> dict:
    """The arguments as they go on the record: no token, cut to a size a person can read."""
    kept = {k: v for k, v in (args or {}).items() if k not in REDACTED}
    text = json.dumps(kept, ensure_ascii=False, default=str)
    if len(text) <= MAX_ARGS_CHARS:
        return kept
    return {"_cut": text[:MAX_ARGS_CHARS]}


def actor_of(user_id: UUID | None, name: str, client_name: str) -> Actor:
    return Actor(user_id, name, via=f"mcp:{client_name}"[:80])


async def event(
    conn: asyncpg.Connection, subject_id: UUID, action: str, actor: Actor,
    detail: dict | None = None, channel: str = "mcp",
) -> None:
    """A change to the connection itself: a grant made or ended, the opt-in, a pause."""
    await team.record(conn, SUBJECT, subject_id, action, actor, None, detail, channel)


async def call(
    conn: asyncpg.Connection, *, grant_id: UUID, user_id: UUID | None, name: str, client_id: str,
    client_name: str, tool: str, phase: str, args: dict | None, result: str, code: str = "",
    millis: int = 0, chars: int = 0, affects: int | None = None,
) -> None:
    """One call, as one row."""
    await team.record(
        conn, SUBJECT, grant_id, "call", Actor(user_id, name), None,
        {
            "client_id": client_id[:200], "client": client_name, "tool": tool, "phase": phase,
            "args": clean_args(args), "result": result, "code": code, "ms": millis,
            "answer_chars": chars, "affects": affects,
        },
        "mcp",
    )
